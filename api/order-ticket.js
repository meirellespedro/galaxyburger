const {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes
} = require("crypto");
const {
  constants: zlibConstants,
  brotliCompressSync,
  brotliDecompressSync
} = require("zlib");
const storeConfig = require("../store-config");
const deliveryQuoteApi = require("./delivery-quote.js");
const { getInventorySnapshot } = require("../lib/_inventory-store");
const {
  ACTIVE_DELIVERY_FEE_VALUES
} = require("../lib/_delivery-areas-store");
const {
  getStoreStatusSnapshot
} = require("../lib/_store-status-store");
const {
  canPersistSharedOrderTicket,
  createPersistedOrderTicketRef,
  isPersistedOrderTicketRef,
  persistSharedOrderTicket,
  readSharedOrderTicket
} = require("../lib/_order-ticket-store");
const { parseJsonBody, sendJsonError } = require("../lib/_http-helpers");
const { assertRateLimitNotExceeded } = require("../lib/_rate-limit");
const { isKvStorageConfigured, kvGetJSON, kvSetJSON } = require("../lib/_kv-storage");

const deliveryInternals = deliveryQuoteApi._internals || {};
const {
  assertCurrentDeliveryQuote,
  verifyQuoteToken,
  buildDeliveryAddressKey,
  sanitizeSubmittedAddress,
  assertSubmittedAddress,
  isSupportedServiceArea,
  createError,
  normalizeText
} = deliveryInternals;

const MAX_CART_ITEM_QUANTITY = 20;
const ORDER_TICKET_TTL_MS = 48 * 60 * 60 * 1000;
const ORDER_TICKET_TOKEN_VERSION = "v2";
const ORDER_RATE_LIMIT_MAX_ATTEMPTS = 20;
const ORDER_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const ORDER_IDEMPOTENCY_TTL_SECONDS = 90;
const STORE_ADDRESS = Object.freeze(storeConfig.store?.address || {});
const STORE_TIME_ZONE = normalizeText(storeConfig.checkout?.timeZone) || "America/Sao_Paulo";
const MIN_ORDER_AMOUNT = Number(storeConfig.checkout?.minimumOrderAmount || 20);
const ALLOWED_PAYMENT_METHODS = new Set(storeConfig.checkout?.paymentMethods || []);

module.exports = async function orderTicketHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      const token = normalizeText(req.query?.token || req.query?.order || req.query?.t || req.query?.ticket);

      if (!token) {
        res.status(200).json({
          ok: true,
          status: "online",
          code: "order_ticket_api_online",
          message: "API de pedido online. Use POST para preparar a comanda ou GET com token para abrir uma comanda existente."
        });
        return;
      }

      const order = isPersistedOrderTicketRef(token)
        ? await readSharedOrderTicket(token)
        : decryptOrderToken(token);

      if (!order) {
        throw createError("invalid_ticket_token", "A comanda segura deste pedido e invalida.", 400);
      }

      ensureOrderPreviewFresh(order);

      res.status(200).json({
        ok: true,
        status: "ready",
        order
      });
      return;
    }

    if (req.method === "POST") {
      await assertRateLimitNotExceeded(req, {
        scope: "order-ticket",
        maxAttempts: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
        windowSeconds: ORDER_RATE_LIMIT_WINDOW_SECONDS,
        createError: () => createError(
          "order_ticket_rate_limited",
          "Muitas tentativas de pedido em pouco tempo. Aguarde um instante antes de tentar novamente.",
          429
        )
      });

      const payload = await parseJsonBody(req);
      const preparedOrder = await prepareOrder(payload, req);

      res.status(200).json({
        ok: true,
        status: "ready",
        order: preparedOrder.order,
        ticketToken: preparedOrder.ticketToken,
        sharedTicketUrl: preparedOrder.sharedTicketUrl,
        whatsAppMessage: preparedOrder.whatsAppMessage
      });
      return;
    }

    res.status(405).json({
      ok: false,
      status: "error",
      code: "method_not_allowed",
      message: "Método não suportado."
    });
  } catch (error) {
    sendJsonError(res, error, {
      routeName: "order-ticket",
      fallbackMessage: "Não foi possível preparar o pedido agora."
    });
  }
};

function normalizeCompareText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeCep(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buildStoreAddressLabel(address = {}) {
  const streetLine = [normalizeText(address.street), normalizeText(address.number)].filter(Boolean).join(", ");
  const cityLine = [
    normalizeText(address.neighborhood),
    [normalizeText(address.city), normalizeText(address.state).toUpperCase()].filter(Boolean).join("/")
  ].filter(Boolean).join(" - ");
  const cep = formatCep(address.cep || "");
  return [streetLine, cityLine, cep ? `CEP ${cep}` : ""].filter(Boolean).join(" - ");
}

function formatCurrency(value) {
  return Number(value || 0)
    .toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })
    .replace(/\u00a0/g, " ");
}

function formatDistanceKm(value) {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return "";
  return `${distance.toFixed(1).replace(".", ",")} km`;
}

function formatPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11;
}

function formatPaymentLabel(payment) {
  const labels = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    "cartao de credito": "Cartão de crédito",
    "cartao de debito": "Cartão de débito"
  };

  return labels[payment] || payment;
}

function buildOrderPaymentLines({ paymentMethod, cashChangeText = "" }) {
  if (paymentMethod === "pix") {
    return ["Pix - aguardando comprovante"];
  }

  const lines = [formatPaymentLabel(paymentMethod)];
  if (paymentMethod === "dinheiro") {
    lines.push(`Troco: ${normalizeText(cashChangeText) || "Não precisa de troco."}`);
  }

  return lines;
}

async function createCatalogContext() {
  const snapshot = await getInventorySnapshot();
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];

  return {
    products,
    productMap: new Map(
      products
        .filter(product => product && normalizeText(product.id))
        .map(product => [normalizeText(product.id), Object.freeze(product)])
    )
  };
}

function getCatalogProduct(productId, catalogContext) {
  return catalogContext?.productMap?.get(normalizeText(productId)) || null;
}

function isProductAvailable(product) {
  return Boolean(product?.available);
}

function getComboOptionProducts(product, catalogContext) {
  if (!product?.combo) {
    return [];
  }

  if (Array.isArray(product.combo.optionIds) && product.combo.optionIds.length) {
    return product.combo.optionIds
      .map(optionId => getCatalogProduct(optionId, catalogContext))
      .filter(option => option && isProductAvailable(option));
  }

  return (Array.isArray(catalogContext?.products) ? catalogContext.products : []).filter(option =>
    option?.category === "drink"
    && option?.comboEligible
    && isProductAvailable(option)
  );
}

function isProductSellable(product, catalogContext) {
  if (!isProductAvailable(product)) {
    return false;
  }

  if (product?.category === "combo" && product?.combo?.drinksCount) {
    return getComboOptionProducts(product, catalogContext).length >= Number(product.combo.drinksCount || 0);
  }

  return true;
}

function buildCartLineItem(rawItem, catalogContext) {
  const product = getCatalogProduct(rawItem?.productId, catalogContext);
  const parsedQuantity = Math.round(Number(rawItem?.quantity || 0));

  if (!product) {
    throw createError("unknown_product", "Existe um item inválido no carrinho. Atualize a página e monte o pedido novamente.", 422);
  }

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > MAX_CART_ITEM_QUANTITY) {
    throw createError("invalid_product_quantity", `Quantidade inválida para ${product.name}.`, 422);
  }

  if (!isProductSellable(product, catalogContext)) {
    throw createError("product_unavailable", `${product.name} está indisponível no momento.`, 409);
  }

  const quantity = parsedQuantity;

  const selectedOptionIds = Array.isArray(rawItem?.selectedOptionIds)
    ? rawItem.selectedOptionIds.map(optionId => normalizeText(optionId)).filter(Boolean)
    : [];
  let variantLabel = "";

  if (product.category === "combo" && product.combo?.drinksCount) {
    const expectedDrinksCount = Number(product.combo.drinksCount || 0);
    const availableOptions = getComboOptionProducts(product, catalogContext);
    const availableOptionMap = new Map(availableOptions.map(option => [option.id, option]));

    if (selectedOptionIds.length !== expectedDrinksCount) {
      throw createError(
        "invalid_combo_selection",
        `Selecione ${expectedDrinksCount} ${expectedDrinksCount === 1 ? "bebida" : "bebidas"} para ${product.name}.`,
        422
      );
    }

    const selectedOptions = selectedOptionIds.map(optionId => availableOptionMap.get(optionId));
    if (selectedOptions.some(option => !option)) {
      throw createError("invalid_combo_option", `Uma bebida escolhida para ${product.name} não está disponível.`, 409);
    }

    variantLabel = `${selectedOptions.length === 1 ? "Bebida" : "Bebidas"}: ${selectedOptions.map(option => option.name).join(", ")}`;
  }

  const unitPrice = Number(product.price || 0);
  const lineTotal = unitPrice * quantity;

  return {
    productId: product.id,
    name: product.name,
    quantity,
    unitPrice,
    unitPriceLabel: formatCurrency(unitPrice),
    lineTotal,
    lineTotalLabel: formatCurrency(lineTotal),
    selectedOptionIds,
    variantLabel
  };
}

async function resolveDeliveryOrderContext(payload = {}) {
  const fulfillment = normalizeCompareText(payload.fulfillment) === "pickup" ? "pickup" : "delivery";

  if (fulfillment === "pickup") {
    return {
      isPickup: true,
      deliveryFeeValue: 0,
      deliveryFeeLabel: "Sem taxa de entrega",
      deliveryQuote: null,
      deliveryValues: {},
      addressData: buildDeliveryAddressData({}, true)
    };
  }

  if (typeof verifyQuoteToken !== "function") {
    throw createError("delivery_validation_unavailable", "A validação da entrega não está disponível no servidor.", 500);
  }

  const rawDeliveryValues = sanitizeSubmittedAddress(payload.delivery?.values || {});
  assertSubmittedAddress(rawDeliveryValues);

  if (!isSupportedServiceArea(rawDeliveryValues)) {
    throw createError("out_of_range", "No momento não entregamos nessa região. Você pode escolher retirada no local.", 409);
  }

  const quoteToken = normalizeText(payload.delivery?.quoteToken);
  if (!quoteToken) {
    throw createError("missing_delivery_quote", "Valide a taxa de entrega antes de enviar o pedido.", 422);
  }

  const quote = verifyQuoteToken(quoteToken);
  if (!quote) {
    throw createError("invalid_delivery_quote", "A validacao da entrega e invalida. Calcule a taxa novamente.", 409);
  }

  if (Date.now() > Number(quote.expiresAt || 0)) {
    throw createError("quote_expired", "A validacao da entrega expirou. Calcule a taxa novamente.", 410);
  }

  const addressKey = buildDeliveryAddressKey(rawDeliveryValues);
  if (quote.addressKey !== addressKey) {
    throw createError("delivery_address_mismatch", "O endereço alterou depois da taxa. Calcule a entrega novamente.", 409);
  }

  let currentArea = null;
  if (typeof assertCurrentDeliveryQuote === "function") {
    currentArea = await assertCurrentDeliveryQuote(quote, rawDeliveryValues);
  }

  const validatedFee = Number(quote.fee || 0);
  if (!Number.isFinite(validatedFee) || validatedFee < 0) {
    throw createError("invalid_delivery_fee", "A taxa de entrega validada voltou com valor invalido.", 409);
  }

  if (!ACTIVE_DELIVERY_FEE_VALUES.includes(validatedFee)) {
    throw createError("invalid_delivery_fee_policy", "A taxa validada desta entrega precisa ser de R$ 5,00 ou R$ 10,00.", 409);
  }

  const validatedDeliveryValues = currentArea
    ? {
        ...rawDeliveryValues,
        deliveryAreaId: normalizeText(currentArea.id)
      }
    : rawDeliveryValues;

  const deliveryQuote = {
    token: quoteToken,
    code: normalizeText(quote.code),
    expiresAt: new Date(Number(quote.expiresAt || 0)).toISOString(),
    fee: validatedFee,
    distanceKm: Number(quote.distanceKm || 0),
    routeDistanceKm: Number(quote.routeDistanceKm || 0),
    zone: normalizeText(quote.zone),
    zoneLabel: normalizeText(quote.zoneLabel),
    addressKey: quote.addressKey,
    deliveryAreaId: normalizeText(currentArea?.id || quote.deliveryAreaId),
    deliveryAreaName: normalizeText(currentArea?.name || quote.deliveryAreaName),
    deliveryAreaStatus: normalizeText(currentArea?.status || quote.deliveryAreaStatus),
    deliveryZoneId: normalizeText(currentArea?.zoneId || quote.deliveryZoneId),
    deliveryAreaUpdatedAt: normalizeText(currentArea?.updatedAt || quote.deliveryAreaUpdatedAt),
    locationPrecision: normalizeText(quote.locationPrecision),
    geocoderSource: normalizeText(quote.geocoderSource),
    validationMode: normalizeText(quote.validationMode || "manual_area"),
    validationStatus: "verified"
  };

  return {
    isPickup: false,
    deliveryFeeValue: validatedFee,
    deliveryFeeLabel: formatCurrency(validatedFee),
    deliveryQuote,
    deliveryValues: validatedDeliveryValues,
    addressData: buildDeliveryAddressData(validatedDeliveryValues, false)
  };
}

function buildDeliveryAddressData(deliveryValues = {}, isPickup = false) {
  if (isPickup) {
    const streetLine = [STORE_ADDRESS.street, STORE_ADDRESS.number].filter(Boolean).join(", ");
    const cityLine = [STORE_ADDRESS.neighborhood, [STORE_ADDRESS.city, STORE_ADDRESS.state].filter(Boolean).join("/")].filter(Boolean).join(" - ");
    const cep = STORE_ADDRESS.cep ? `CEP: ${formatCep(STORE_ADDRESS.cep)}` : "";
    return {
      compactAddressLine: buildStoreAddressLabel(STORE_ADDRESS),
      referenceText: "Retirada no local",
      ticketAddressLines: [streetLine, cityLine, cep].filter(Boolean),
      mapsQueryAddress: buildStoreAddressLabel(STORE_ADDRESS)
    };
  }

  const streetLine = [deliveryValues.street, deliveryValues.number].filter(Boolean).join(", ");
  const cityState = [deliveryValues.city, deliveryValues.state].filter(Boolean).join("/");
  const locationLine = [deliveryValues.neighborhood, cityState].filter(Boolean).join(" - ");
  const ticketAddressLines = [streetLine, locationLine].filter(Boolean);
  if (deliveryValues.complement) ticketAddressLines.push(`Complemento: ${deliveryValues.complement}`);
  if (deliveryValues.cep) ticketAddressLines.push(`CEP: ${formatCep(deliveryValues.cep)}`);

  return {
    compactAddressLine: [streetLine, deliveryValues.complement, deliveryValues.neighborhood, cityState].filter(Boolean).join(" - "),
    referenceText: normalizeText(deliveryValues.reference) || "Não informado",
    ticketAddressLines,
    mapsQueryAddress: [streetLine, deliveryValues.neighborhood, deliveryValues.city, deliveryValues.state, formatCep(deliveryValues.cep), "Brasil"].filter(Boolean).join(", ")
  };
}

function generateMapsLink(query) {
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

function getOrderCreatedAtLabel(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(",", "");
}

function buildOrderCode(reference) {
  return `GB-${createHmac("sha256", getOrderSecret()).update(reference).digest("hex").slice(0, 8).toUpperCase()}`;
}

function buildSharedOrderTicketUrl(identifier, req, queryParam = "order") {
  if (!identifier) return "";
  const configuredBaseUrl = normalizeText(storeConfig.store?.publicOrderTicketBaseUrl);

  try {
    const baseUrl = configuredBaseUrl
      ? new URL(configuredBaseUrl)
      : new URL(`${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host || ""}/`);

    baseUrl.search = "";
    baseUrl.hash = "";
    baseUrl.searchParams.set(queryParam, identifier);
    return baseUrl.toString();
  } catch {
    return "";
  }
}

function buildWhatsAppOrderMessage(order, ticketUrl) {
  const lines = [
    "NOTA - GALAXY BURGER",
    "-".repeat(30),
    `Codigo: ${order.orderCode}`,
    `Data: ${order.createdAt}`,
    "",
    order.isPickup ? "RETIRADA:" : "ENTREGA:",
    order.addressData.compactAddressLine,
    ...(!order.isPickup ? [`Referencia: ${order.addressData.referenceText}`] : []),
    "",
    `Nome: ${order.name}`,
    `Telefone: ${order.customerPhone}`,
    "",
    "Itens:"
  ];

  order.items.forEach(item => {
    lines.push(`${item.quantity}x ${item.name}`);
    if (item.variantLabel) {
      lines.push(`Obs item: ${item.variantLabel}`);
    }
  });

  if (order.notes) {
    lines.push("", "Observacoes:", order.notes);
  }

  lines.push(
    "",
    "Pagamento:",
    ...order.paymentLines,
    "",
    `Subtotal: ${order.subtotalLabel}`,
    `Entrega: ${order.deliveryFeeLabel}`,
    `Total: ${order.totalLabel}`
  );

  if (!order.isPickup && order.deliveryQuote?.code) {
    lines.push(
      "",
      "Validacao da entrega:",
      `${order.deliveryQuote.code}${order.deliveryQuote.zoneLabel ? ` | ${order.deliveryQuote.zoneLabel}` : ""}${order.deliveryQuote.routeDistanceKm ? ` | ${formatDistanceKm(order.deliveryQuote.routeDistanceKm)}` : order.deliveryQuote.distanceKm ? ` | ${formatDistanceKm(order.deliveryQuote.distanceKm)}` : ""}`
    );
  }

  if (ticketUrl) {
    lines.push("", "Comanda segura da loja:", ticketUrl);
  }

  lines.push("", "-".repeat(30), "Pedido sujeito a confirmacao.");
  return lines.join("\n").trim();
}

function buildOrderIdempotencyKey({ customerName, customerPhone, notes, paymentMethod, cashChangeText, rawCart, payload }) {
  const deliveryFingerprint = normalizeCompareText(payload.fulfillment) === "pickup"
    ? "pickup"
    : normalizeText(payload.delivery?.quoteToken);

  const cartFingerprint = rawCart
    .map(item => `${normalizeText(item?.id || item?.productId)}x${Number(item?.quantity) || 0}`)
    .sort()
    .join(",");

  const fingerprint = createHash("sha256")
    .update([customerName, customerPhone, notes, paymentMethod, cashChangeText, deliveryFingerprint, cartFingerprint].join("|"))
    .digest("hex");

  return `hamburgeria:order-idem:${fingerprint}`;
}

async function prepareOrder(payload = {}, req) {
  const customerName = normalizeText(payload.customer?.name || payload.name);
  const customerPhone = formatPhoneDigits(payload.customer?.phone || payload.customerPhone);
  const notes = normalizeText(payload.notes);
  const paymentMethod = normalizeCompareText(payload.payment?.method || payload.paymentMethod);
  const cashChangeText = normalizeText(payload.payment?.cashChangeText || payload.cashChangeText);
  const rawCart = Array.isArray(payload.cart) ? payload.cart : [];

  // Clique duplo ou reenvio por conexão instável não deve virar duas comandas:
  // se o mesmo pedido (cliente + carrinho + entrega) já foi preparado há pouco,
  // devolve o resultado anterior em vez de criar um novo.
  const idempotencyKey = buildOrderIdempotencyKey({ customerName, customerPhone, notes, paymentMethod, cashChangeText, rawCart, payload });

  if (isKvStorageConfigured()) {
    try {
      const cached = await kvGetJSON(idempotencyKey);
      if (cached) {
        return cached;
      }
    } catch {
      // Falha na leitura não deve impedir o pedido de seguir normalmente.
    }
  }

  await assertStoreAcceptingOrders();
  const catalogContext = await createCatalogContext();

  if (!customerName) {
    throw createError("missing_customer_name", "Informe seu nome antes de enviar o pedido.", 422);
  }

  if (!isValidPhoneNumber(customerPhone)) {
    throw createError("invalid_customer_phone", "Informe um telefone valido com DDD.", 422);
  }

  if (!rawCart.length) {
    throw createError("empty_cart", "O carrinho esta vazio.", 422);
  }

  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw createError("invalid_payment_method", "Escolha uma forma de pagamento valida.", 422);
  }

  const items = rawCart.map(item => buildCartLineItem(item, catalogContext));
  const subtotalValue = items.reduce((sum, item) => sum + item.lineTotal, 0);

  if (subtotalValue < MIN_ORDER_AMOUNT) {
    throw createError("minimum_order_not_reached", "O pedido mínimo ainda não foi atingido.", 422);
  }

  const deliveryContext = await resolveDeliveryOrderContext(payload);
  const totalValue = subtotalValue + deliveryContext.deliveryFeeValue;
  const createdAt = getOrderCreatedAtLabel();
  const issuedAt = Date.now();
  const orderCode = buildOrderCode(`${customerName}|${customerPhone}|${issuedAt}|${totalValue}`);
  const paymentLines = buildOrderPaymentLines({ paymentMethod, cashChangeText });
  const order = {
    orderCode,
    issuedAt,
    expiresAt: issuedAt + ORDER_TICKET_TTL_MS,
    createdAt,
    name: customerName,
    customerPhone,
    notes,
    isPickup: deliveryContext.isPickup,
    fulfillmentLabel: deliveryContext.isPickup ? "Retirada" : "Entrega",
    items,
    itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
    addressData: deliveryContext.addressData,
    addressLines: [
      ...deliveryContext.addressData.ticketAddressLines,
      ...(deliveryContext.isPickup ? [] : [`Referencia: ${deliveryContext.addressData.referenceText}`])
    ],
    mapsLink: deliveryContext.isPickup ? "" : generateMapsLink(deliveryContext.addressData.mapsQueryAddress),
    paymentMethod,
    paymentLines,
    paymentSummary: paymentLines.join(" | "),
    deliveryValues: deliveryContext.deliveryValues,
    deliveryQuote: deliveryContext.deliveryQuote,
    deliveryFeeValue: deliveryContext.deliveryFeeValue,
    deliveryFeeLabel: deliveryContext.isPickup ? "Sem taxa de entrega" : formatCurrency(deliveryContext.deliveryFeeValue),
    feeLabelTitle: deliveryContext.isPickup ? "Retirada" : "Taxa validada",
    subtotalValue,
    subtotalLabel: formatCurrency(subtotalValue),
    totalValue,
    totalLabel: formatCurrency(totalValue)
  };

  const ticketToken = encryptOrderToken(order);
  let sharedTicketRef = "";
  let sharedTicketUrl = "";

  if (canPersistSharedOrderTicket()) {
    try {
      sharedTicketRef = createPersistedOrderTicketRef();
      sharedTicketUrl = buildSharedOrderTicketUrl(sharedTicketRef, req, "ticket");
      order.sharedTicketRef = sharedTicketRef;
      order.sharedTicketUrl = sharedTicketUrl;
      await persistSharedOrderTicket(sharedTicketRef, order);
    } catch {
      sharedTicketRef = "";
      sharedTicketUrl = "";
    }
  }

  if (!sharedTicketUrl) {
    sharedTicketUrl = buildSharedOrderTicketUrl(ticketToken, req, "order");
    order.sharedTicketRef = "";
    order.sharedTicketUrl = sharedTicketUrl;
  }

  const whatsAppMessage = buildWhatsAppOrderMessage(order, sharedTicketUrl);

  const result = {
    order,
    ticketToken,
    sharedTicketRef,
    sharedTicketUrl,
    whatsAppMessage
  };

  if (isKvStorageConfigured()) {
    try {
      await kvSetJSON(idempotencyKey, result, { expireInSeconds: ORDER_IDEMPOTENCY_TTL_SECONDS });
    } catch {
      // Não crítico: na pior hipótese, um duplo clique gera duas comandas.
    }
  }

  return result;
}

async function assertStoreAcceptingOrders() {
  const storeStatus = await getStoreStatusSnapshot();

  if (normalizeCompareText(storeStatus.overrideMode) === "force_closed") {
    throw createError(
      "store_orders_closed",
      "A Galaxy Burger esta com os pedidos fechados no painel administrativo no momento.",
      409
    );
  }
}

function getOrderSecret() {
  const configuredSecret = normalizeText(process.env.ORDER_TICKET_SECRET || process.env.DELIVERY_QUOTE_SECRET);

  if (configuredSecret) {
    return configuredSecret;
  }

  throw createError("missing_order_secret", "A comanda segura do pedido não foi configurada corretamente neste ambiente.", 500);
}

function getOrderCipherKey() {
  return createHash("sha256").update(getOrderSecret()).digest();
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function encryptOrderToken(order) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getOrderCipherKey(), iv);
  const rawPayload = Buffer.from(JSON.stringify(order), "utf8");
  const compressedPayload = brotliCompressSync(rawPayload, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5
    }
  });
  const encrypted = Buffer.concat([cipher.update(compressedPayload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ORDER_TICKET_TOKEN_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(tag),
    encodeBase64Url(encrypted)
  ].join(".");
}

function decryptOrderToken(token) {
  const tokenParts = String(token || "").split(".");
  const hasVersionPrefix = tokenParts.length === 4 && tokenParts[0] === ORDER_TICKET_TOKEN_VERSION;
  const [encodedIv, encodedTag, encodedPayload] = hasVersionPrefix
    ? tokenParts.slice(1)
    : tokenParts;

  if (!encodedIv || !encodedTag || !encodedPayload || (!hasVersionPrefix && tokenParts.length !== 3)) {
    throw createError("invalid_ticket_token", "A comanda segura deste pedido e invalida.", 400);
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", getOrderCipherKey(), decodeBase64Url(encodedIv));
    decipher.setAuthTag(decodeBase64Url(encodedTag));
    const decryptedBuffer = Buffer.concat([
      decipher.update(decodeBase64Url(encodedPayload)),
      decipher.final()
    ]);
    const payloadBuffer = hasVersionPrefix
      ? brotliDecompressSync(decryptedBuffer)
      : decryptedBuffer;
    return JSON.parse(payloadBuffer.toString("utf8"));
  } catch {
    throw createError("invalid_ticket_token", "A comanda segura deste pedido e invalida.", 400);
  }
}

function ensureOrderPreviewFresh(order) {
  const expiresAt = Number(order?.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || !expiresAt) {
    throw createError("invalid_ticket_token", "A comanda segura deste pedido esta incompleta.", 400);
  }

  if (Date.now() > expiresAt) {
    throw createError("ticket_expired", "A comanda segura deste pedido expirou.", 410);
  }
}
