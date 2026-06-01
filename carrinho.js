let cart = loadSavedCart();

const SHARED_STORE_CONFIG = window.GALAXY_STORE_CONFIG || {};
const SHARED_DELIVERY_CONFIG = window.GALAXY_DELIVERY_CONFIG || {};
const SHARED_CATALOG_CONFIG = window.GALAXY_CATALOG_CONFIG || {};

const PIX_KEY = normalizeText(SHARED_STORE_CONFIG.pix?.key);
const PIX_BENEFICIARY_NAME = normalizeText(SHARED_STORE_CONFIG.pix?.beneficiaryName);
const STORE_WHATSAPP = normalizeText(SHARED_STORE_CONFIG.store?.whatsapp);
const WHATSAPP_ORDER_BASE_URL = "https://api.whatsapp.com/send";
const IFOOD_STORE_URL = normalizeText(SHARED_STORE_CONFIG.store?.iFoodUrl);
const PUBLIC_ORDER_TICKET_BASE_URL = normalizeText(SHARED_STORE_CONFIG.store?.publicOrderTicketBaseUrl);

const CONFIGURED_STORE_ADDRESS = Object.freeze({
  street: normalizeText(SHARED_STORE_CONFIG.store?.address?.street),
  number: normalizeText(SHARED_STORE_CONFIG.store?.address?.number),
  neighborhood: normalizeText(SHARED_STORE_CONFIG.store?.address?.neighborhood),
  city: normalizeText(SHARED_STORE_CONFIG.store?.address?.city),
  state: normalizeText(SHARED_STORE_CONFIG.store?.address?.state).toUpperCase(),
  cep: normalizeCep(SHARED_STORE_CONFIG.store?.address?.cep)
});
const CONFIGURED_SERVICE_AREA = Object.freeze({
  city: normalizeText(SHARED_DELIVERY_CONFIG.serviceArea?.city || CONFIGURED_STORE_ADDRESS.city),
  state: normalizeText(SHARED_DELIVERY_CONFIG.serviceArea?.state || CONFIGURED_STORE_ADDRESS.state).toUpperCase()
});

const STORE_ADDRESS = buildStoreAddressLabel(CONFIGURED_STORE_ADDRESS);
const STORE_ADDRESS_LINES = Object.freeze([
  [CONFIGURED_STORE_ADDRESS.street, CONFIGURED_STORE_ADDRESS.number].filter(Boolean).join(", "),
  [
    CONFIGURED_STORE_ADDRESS.neighborhood,
    [CONFIGURED_STORE_ADDRESS.city, CONFIGURED_STORE_ADDRESS.state].filter(Boolean).join("/")
  ].filter(Boolean).join(" - "),
  CONFIGURED_STORE_ADDRESS.cep ? `CEP ${formatCep(CONFIGURED_STORE_ADDRESS.cep)}` : ""
].filter(Boolean));
const ORDER_TICKET_WIDTH = 30;
const ORDER_TICKET_DIVIDER = "-".repeat(ORDER_TICKET_WIDTH);
const STORE_TIME_ZONE = normalizeText(SHARED_STORE_CONFIG.checkout?.timeZone) || "America/Sao_Paulo";
// Use "live" para respeitar o horário real da loja. Troque para "preview" apenas em testes.
const STORE_SCHEDULE_MODE = normalizeText(SHARED_STORE_CONFIG.checkout?.scheduleMode) || "live";
const STORE_WEEKDAY_TOKENS = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
});
const STORE_WEEKDAY_LABELS = Object.freeze([
  "domingo",
  "segunda",
  "ter\u00e7a",
  "quarta",
  "quinta",
  "sexta",
  "s\u00e1bado"
]);
const STORE_HOURS = Object.freeze(SHARED_STORE_CONFIG.checkout?.hours || {
  0: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  1: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  2: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  3: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  4: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  5: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
  6: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 })
});
const STORE_TEMPORARY_CLOSURE = normalizeStoreTemporaryClosure(SHARED_STORE_CONFIG.checkout?.temporaryClosure);

const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const DELIVERY_QUOTE_API_URL = "/api/delivery-quote";
const DELIVERY_AREAS_API_URL = "/api/delivery-areas";
const ORDER_TICKET_API_URL = "/api/order-ticket";
const INVENTORY_STATUS_API_URL = "/api/inventory-status";
const STORE_STATUS_API_URL = "/api/store-status";
const DELIVERY_FEE_LOCAL = 5;
const DELIVERY_FEE_EXTENDED = 10;
const MIN_ORDER_AMOUNT = normalizeMoneyValue(SHARED_STORE_CONFIG.checkout?.minimumOrderAmount, 20);
const MAX_WHATSAPP_URL_LENGTH = 1800;
const WHATSAPP_FALLBACK_DELAY_MS = 700;
const WHATSAPP_OPEN_CHECK_DELAY_MS = 1800;
const DELIVERY_QUOTE_EXPIRY_BUFFER_MS = 30 * 1000;
const DELIVERY_REQUEST_TIMEOUT_MS = 12000;
const DELIVERY_AREAS_REQUEST_TIMEOUT_MS = 8000;
const INVENTORY_REQUEST_TIMEOUT_MS = 8000;
const STORE_STATUS_REQUEST_TIMEOUT_MS = 8000;
const INVENTORY_REFRESH_INTERVAL_MS = 5000;
const DELIVERY_AREAS_REFRESH_INTERVAL_MS = 60000;
const STORE_STATUS_REFRESH_INTERVAL_MS = 30000;
const VIA_CEP_REQUEST_TIMEOUT_MS = 8000;
const DELIVERY_AUTO_CALCULATE_DEBOUNCE_MS = 700;
const DELIVERY_IDLE_MESSAGE = "Preencha o endereco completo para calcular a entrega.";
const CHECKOUT_LOG_PREFIX = "[Galaxy Burger checkout]";
const DELIVERY_STATUS_VALUES = new Set(["idle", "loading", "ready", "out_of_range", "blocked", "pickup_only", "error", "pickup"]);
const STORE_STATUS_OVERRIDE_VALUES = new Set(["auto", "force_open", "force_closed"]);
const INVALID_HOUSE_NUMBER_VALUES = new Set(["s/n", "s n", "sn", "sem numero", "sem numero.", "sem numero,"]);
const BR_PHONE_MIN_LENGTH = 10;
const BR_PHONE_MAX_LENGTH = 11;
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(SHARED_DELIVERY_CONFIG.normalization?.abbreviations || {})
);

const DELIVERY_STORAGE_KEY = "galaxy_burguer_delivery_v16";
const ORDER_PREPARATION_STORAGE_KEY = "galaxy_burguer_pending_order_v1";
const DELIVERY_AREAS_BROADCAST_STORAGE_KEY = "galaxy_burguer_delivery_areas_broadcast_v1";
const INVENTORY_BROADCAST_STORAGE_KEY = "galaxy_burguer_inventory_broadcast_v1";
const STORE_STATUS_BROADCAST_STORAGE_KEY = "galaxy_burguer_store_status_broadcast_v1";
const INVENTORY_SYNC_CHANNEL_NAME = "galaxy_burguer_inventory_sync_v1";
const LEGACY_DELIVERY_STORAGE_KEYS = [
  "galaxy_burguer_delivery",
  "galaxy_burguer_delivery_v3",
  "galaxy_burguer_delivery_v4",
  "galaxy_burguer_delivery_v5",
  "galaxy_burguer_delivery_v6",
  "galaxy_burguer_delivery_v7",
  "galaxy_burguer_delivery_v8",
  "galaxy_burguer_delivery_v9",
  "galaxy_burguer_delivery_v10",
  "galaxy_burguer_delivery_v11",
  "galaxy_burguer_delivery_v12",
  "galaxy_burguer_delivery_v13",
  "galaxy_burguer_delivery_v14",
  "galaxy_burguer_delivery_v15",
  "galaxy_burguer_store_coords_v1"
];

const CATALOG_PRODUCTS = Array.isArray(SHARED_CATALOG_CONFIG.products) ? SHARED_CATALOG_CONFIG.products : [];
const CATALOG_PRODUCT_MAP = new Map(
  CATALOG_PRODUCTS
    .filter(product => product && normalizeText(product.id))
    .map(product => [normalizeText(product.id), Object.freeze(product)])
);
let catalogInventoryStatusMap = new Map(
  CATALOG_PRODUCTS
    .filter(product => product && normalizeText(product.id))
    .map(product => [normalizeText(product.id), {
      available: Boolean(product.available),
      stockUpdatedAt: ""
    }])
);

let deliveryState = createDeliveryState();

const viaCepCache = new Map();
const DELIVERY_ZONE_LABELS = Object.freeze(
  (Array.isArray(SHARED_DELIVERY_CONFIG.zones) ? SHARED_DELIVERY_CONFIG.zones : []).reduce((labels, zone) => {
    if ((zone?.id || zone?.value) && zone?.label) {
      labels[normalizeText(zone.id || zone.value)] = normalizeText(zone.label);
    }

    return labels;
  }, {
    zone_5: `Ate 2,9 km da base - ${formatCurrency(DELIVERY_FEE_LOCAL)}`,
    zone_10: `De 3 km ate 5 km da base - ${formatCurrency(DELIVERY_FEE_EXTENDED)}`,
    pickup_only: "A partir de 5,1 km - somente retirada",
    blocked: "Regiao bloqueada para entrega",
    out_of_range: "Acima de 5 km - apenas retirada"
  })
);
let activeComboSelection = null;
let pendingOrderPreview = null;
let orderTicketModalMode = "checkout";
let cartModalHiddenForOrderTicket = false;
let activeWhatsAppAttempt = null;
let activeDeliveryQuoteRequest = null;
let activeDeliveryAreasRequest = null;
let activeInventoryStatusRequest = null;
let activeStoreStatusRequest = null;
let activeViaCepLookup = null;
let deliveryAutoQuoteTimer = 0;
let pendingCustomerOrder = loadPendingCustomerOrder();
let inventoryRealtimeChannel = null;
let deliveryAreasState = createDeliveryAreasState();
let storeStatusState = createStoreStatusState();

function formatCurrency(value) {
  return normalizeMoneyValue(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function normalizeMoneyValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCep(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeStoreTemporaryClosure(closure) {
  if (!closure || closure.enabled === false) {
    return null;
  }

  const reopenAtValue = normalizeText(closure.reopenAt);
  if (!reopenAtValue) {
    return null;
  }

  const reopenAt = new Date(reopenAtValue);
  if (Number.isNaN(reopenAt.getTime())) {
    return null;
  }

  return Object.freeze({
    reopenAt
  });
}

function normalizeCompareText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function applyAddressAbbreviations(value) {
  return DELIVERY_NORMALIZATION_ABBREVIATIONS.reduce((normalizedValue, [alias, replacement]) =>
    normalizedValue.replace(new RegExp(`\\b${alias}\\b`, "g"), replacement),
  value);
}

function normalizeAddressToken(value) {
  return applyAddressAbbreviations(normalizeCompareText(value))
    .replace(/[.,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeCatalogLookupValue(value) {
  return normalizeCompareText(value)
    .replace(/[.,/()_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCatalogInventoryEntry(productId) {
  return catalogInventoryStatusMap.get(normalizeText(productId)) || null;
}

function getCatalogProduct(productId) {
  const normalizedProductId = normalizeText(productId);
  const baseProduct = CATALOG_PRODUCT_MAP.get(normalizedProductId) || null;
  if (!baseProduct) return null;

  const inventoryEntry = getCatalogInventoryEntry(normalizedProductId);
  if (!inventoryEntry) {
    return baseProduct;
  }

  return {
    ...baseProduct,
    available: Boolean(inventoryEntry.available),
    stockUpdatedAt: normalizeText(inventoryEntry.stockUpdatedAt)
  };
}

function findCatalogProductByName(name) {
  const normalizedName = normalizeCatalogLookupValue(name);
  if (!normalizedName) return null;

  const matchedProduct = CATALOG_PRODUCTS.find(product => {
    const catalogNames = [product?.name, ...(Array.isArray(product?.aliases) ? product.aliases : [])];
    return catalogNames.some(candidate => normalizeCatalogLookupValue(candidate) === normalizedName);
  }) || null;

  return matchedProduct ? getCatalogProduct(matchedProduct.id) : null;
}

function isCatalogProductAvailable(product) {
  return Boolean(product?.available);
}

function isCatalogProductSellable(product) {
  if (!isCatalogProductAvailable(product)) {
    return false;
  }

  if (product?.category === "combo" && product?.combo?.drinksCount) {
    return getCatalogComboOptionProducts(product).length >= Number(product.combo.drinksCount || 0);
  }

  return true;
}

function getCatalogComboOptionProducts(product) {
  if (!product?.combo) {
    return [];
  }

  const explicitOptionIds = Array.isArray(product.combo.optionIds)
    ? product.combo.optionIds
        .map(optionId => getCatalogProduct(optionId))
        .filter(option => option && isCatalogProductAvailable(option))
    : [];

  if (explicitOptionIds.length) {
    return explicitOptionIds;
  }

  return CATALOG_PRODUCTS.filter(option =>
    option?.category === "drink"
    && option?.comboEligible
    && isCatalogProductAvailable(getCatalogProduct(option.id))
  );
}

function isCartItemSellable(item) {
  const product = getCatalogProduct(item?.productId);
  if (!isCatalogProductSellable(product)) {
    return false;
  }

  if (product?.category === "combo" && product?.combo?.drinksCount) {
    const selectedOptionIds = Array.isArray(item?.selectedOptionIds)
      ? item.selectedOptionIds.map(optionId => normalizeText(optionId)).filter(Boolean)
      : [];

    if (selectedOptionIds.length !== Number(product.combo.drinksCount || 0)) {
      return false;
    }

    return selectedOptionIds.every(optionId => isCatalogProductAvailable(getCatalogProduct(optionId)));
  }

  return true;
}

function buildRemovedUnavailableItemsMessage(items) {
  const uniqueNames = [...new Set(
    items
      .map(item => normalizeText(item?.name))
      .filter(Boolean)
  )];

  if (!uniqueNames.length) {
    return "Alguns itens saíram do pedido porque ficaram esgotados.";
  }

  if (uniqueNames.length === 1) {
    return `${uniqueNames[0]} saiu do pedido porque ficou esgotado.`;
  }

  if (uniqueNames.length === 2) {
    return `${uniqueNames[0]} e ${uniqueNames[1]} saíram do pedido porque ficaram esgotados.`;
  }

  return `${uniqueNames.length} itens saíram do pedido porque ficaram esgotados.`;
}

function purgeUnavailableCartItems({ notify = true, reason = "inventory_changed" } = {}) {
  const sellableItems = [];
  const removedItems = [];

  cart.forEach(item => {
    if (isCartItemSellable(item)) {
      sellableItems.push(item);
      return;
    }

    removedItems.push(item);
  });

  if (!removedItems.length) {
    return [];
  }

  cart = sellableItems;
  invalidatePendingCustomerOrder(`inventory_refresh:${reason}`);
  pendingOrderPreview = null;
  const orderTicketModal = document.getElementById("order-ticket-modal");
  if (orderTicketModal && !orderTicketModal.hidden && orderTicketModalMode === "checkout") {
    closeOrderTicketModal({ restoreCart: true });
  }
  saveCart();

  if (notify) {
    showToast(buildRemovedUnavailableItemsMessage(removedItems));
  }

  return removedItems;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, BR_PHONE_MAX_LENGTH);
}

function formatPhoneInput(value) {
  const digits = normalizePhoneDigits(value);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidPhoneNumber(value) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= BR_PHONE_MIN_LENGTH && digits.length <= BR_PHONE_MAX_LENGTH;
}

function normalizeDeliveryStateStatus(value) {
  const status = normalizeCompareText(value).replace(/\s+/g, "_");
  return DELIVERY_STATUS_VALUES.has(status) ? status : "idle";
}

function sanitizeValidatedAddress(address) {
  if (!address || typeof address !== "object") {
    return null;
  }

  return {
    deliveryAreaId: normalizeText(address.deliveryAreaId),
    cep: normalizeCep(address.cep),
    street: normalizeText(address.street),
    number: normalizeText(address.number),
    neighborhood: normalizeText(address.neighborhood),
    complement: normalizeText(address.complement),
    reference: normalizeText(address.reference),
    city: normalizeText(address.city),
    state: normalizeText(address.state).toUpperCase()
  };
}

function sanitizeCartItem(item) {
  const catalogProduct = getCatalogProduct(item?.productId) || findCatalogProductByName(item?.name);
  const name = normalizeText(catalogProduct?.name || item?.name);
  const quantity = Math.max(1, Math.round(normalizeMoneyValue(item?.quantity, 0)));
  const price = normalizeMoneyValue(catalogProduct?.price ?? item?.price, NaN);
  const variantLabel = normalizeText(item?.variantLabel);
  const productId = normalizeText(catalogProduct?.id || item?.productId);
  const selectedOptionIds = Array.isArray(item?.selectedOptionIds)
    ? item.selectedOptionIds.map(optionId => normalizeText(optionId)).filter(Boolean)
    : [];

  if (!name || !productId || !Number.isFinite(price) || price < 0 || quantity <= 0) {
    return null;
  }

  return {
    productId,
    name,
    price,
    quantity,
    ...(selectedOptionIds.length ? { selectedOptionIds } : {}),
    ...(variantLabel ? { variantLabel } : {})
  };
}

function loadSavedCart() {
  try {
    const rawCart = JSON.parse(localStorage.getItem("cart") || "[]");
    if (!Array.isArray(rawCart)) {
      return [];
    }

    return rawCart
      .map(sanitizeCartItem)
      .filter(Boolean);
  } catch {
    localStorage.removeItem("cart");
    return [];
  }
}

function createDeliveryState(overrides = {}) {
  const nextState = {
    status: "idle",
    fee: 0,
    distanceLabel: "",
    distanceRange: "",
    address: "",
    message: DELIVERY_IDLE_MESSAGE,
    quoteCode: "",
    quoteToken: "",
    addressKey: "",
    expiresAt: "",
    distanceKm: 0,
    routeDistanceKm: 0,
    locationPrecision: "",
    geocoderSource: "",
    deliveryAreaId: "",
    deliveryAreaName: "",
    deliveryAreaStatus: "",
    deliveryAreaNote: "",
    validatedAddress: null,
    ...overrides
  };

  return {
    status: normalizeDeliveryStateStatus(nextState.status),
    fee: Math.max(0, normalizeMoneyValue(nextState.fee)),
    distanceLabel: normalizeText(nextState.distanceLabel),
    distanceRange: normalizeText(nextState.distanceRange),
    address: normalizeText(nextState.address),
    message: normalizeText(nextState.message) || DELIVERY_IDLE_MESSAGE,
    quoteCode: normalizeText(nextState.quoteCode),
    quoteToken: String(nextState.quoteToken || "").trim(),
    addressKey: normalizeText(nextState.addressKey),
    expiresAt: String(nextState.expiresAt || "").trim(),
    distanceKm: Math.max(0, normalizeMoneyValue(nextState.distanceKm)),
    routeDistanceKm: Math.max(0, normalizeMoneyValue(nextState.routeDistanceKm)),
    locationPrecision: normalizeText(nextState.locationPrecision),
    geocoderSource: normalizeText(nextState.geocoderSource),
    deliveryAreaId: normalizeText(nextState.deliveryAreaId),
    deliveryAreaName: normalizeText(nextState.deliveryAreaName),
    deliveryAreaStatus: normalizeText(nextState.deliveryAreaStatus),
    deliveryAreaNote: normalizeText(nextState.deliveryAreaNote),
    validatedAddress: sanitizeValidatedAddress(nextState.validatedAddress)
  };
}

function createDeliveryAreasState(overrides = {}) {
  return {
    loaded: Boolean(overrides.loaded),
    loading: Boolean(overrides.loading),
    updatedAt: normalizeText(overrides.updatedAt),
    error: normalizeText(overrides.error),
    zones: Array.isArray(overrides.zones) ? overrides.zones.slice() : [],
    areas: Array.isArray(overrides.areas) ? overrides.areas.slice() : []
  };
}

function normalizeStoreStatusOverrideMode(value) {
  const overrideMode = normalizeCompareText(value).replace(/[\s-]+/g, "_");
  return STORE_STATUS_OVERRIDE_VALUES.has(overrideMode) ? overrideMode : "auto";
}

function createStoreStatusState(overrides = {}) {
  return {
    loaded: Boolean(overrides.loaded),
    loading: Boolean(overrides.loading),
    updatedAt: normalizeText(overrides.updatedAt),
    error: normalizeText(overrides.error),
    overrideMode: normalizeStoreStatusOverrideMode(overrides.overrideMode),
    persistenceConfigured: overrides.persistenceConfigured !== false
  };
}

function sanitizeDeliveryZoneOption(zone) {
  const id = normalizeText(zone?.id);
  const name = normalizeText(zone?.name);
  const status = normalizeCompareText(zone?.status).replace(/[\s-]+/g, "_");
  const fee = Math.max(0, normalizeMoneyValue(zone?.fee, 0));

  if (!id || !name || !["active", "blocked", "pickup_only"].includes(status)) {
    return null;
  }

  return {
    id,
    name,
    status,
    fee,
    label: normalizeText(zone?.label),
    minDistanceKm: Math.max(0, normalizeMoneyValue(zone?.minDistanceKm, 0)),
    maxDistanceKm: Math.max(0, normalizeMoneyValue(zone?.maxDistanceKm, 0))
  };
}

function sanitizeDeliveryAreaOption(area) {
  const id = normalizeText(area?.id);
  const name = normalizeText(area?.name);
  const status = normalizeCompareText(area?.status).replace(/[\s-]+/g, "_");
  const fee = Math.max(0, normalizeMoneyValue(area?.fee, 0));
  const zoneId = normalizeText(area?.zoneId);

  if (!id || !name || !["active", "blocked", "pickup_only"].includes(status)) {
    return null;
  }

  return {
    id,
    name,
    normalizedName: normalizeAddressToken(name),
    zoneId,
    zoneName: normalizeText(area?.zoneName),
    zoneLabel: normalizeText(area?.zoneLabel),
    status,
    fee,
    note: normalizeText(area?.note),
    supportsDelivery: status === "active",
    blocked: status === "blocked",
    pickupOnly: status === "pickup_only",
    minDistanceKm: Math.max(0, normalizeMoneyValue(area?.minDistanceKm, 0)),
    maxDistanceKm: Math.max(0, normalizeMoneyValue(area?.maxDistanceKm, 0)),
    updatedAt: normalizeText(area?.updatedAt)
  };
}

function getDeliveryAreasMap() {
  return new Map(
    (Array.isArray(deliveryAreasState.areas) ? deliveryAreasState.areas : [])
      .filter(Boolean)
      .map(area => [area.id, area])
  );
}

function getDeliveryAreaByIdLocal(areaId) {
  return getDeliveryAreasMap().get(normalizeText(areaId)) || null;
}

function findDeliveryAreaByNameLocal(name) {
  const normalizedName = normalizeAddressToken(name);
  if (!normalizedName) {
    return null;
  }

  return (deliveryAreasState.areas || []).find(area => area.normalizedName === normalizedName) || null;
}

function buildDeliveryAreaOptionLabel(area) {
  if (!area) {
    return "";
  }

  if (area.status === "active") {
    return `${area.name} - ${formatCurrency(area.fee)}`;
  }

  if (area.status === "pickup_only") {
    return `${area.name} - somente retirada`;
  }

  return `${area.name} - entrega bloqueada`;
}

function createTimedRequest(timeoutMs) {
  const controller = new AbortController();
  const request = {
    controller,
    didTimeout: false,
    cancelReason: ""
  };

  request.timeoutId = window.setTimeout(() => {
    request.didTimeout = true;
    controller.abort();
  }, timeoutMs);

  request.cleanup = () => {
    window.clearTimeout(request.timeoutId);
  };

  return request;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function isCampoGrandeNeighborhood(value) {
  return normalizeCompareText(value) === "campo grande";
}

function formatDistanceKm(value) {
  const distance = normalizeMoneyValue(value, 0);
  if (!Number.isFinite(distance) || distance <= 0) return "";
  return `${distance.toFixed(1).replace(".", ",")} km`;
}

function formatGeocoderSourceLabel(value) {
  const normalized = normalizeDeliveryMetadataValue(value);

  if (normalized === "manual_zone_registry" || normalized === "manual_zone") return "cadastro local";
  if (normalized === "google_maps" || normalized === "googlemaps" || normalized === "google") return "Google Maps";
  if (normalized === "photon") return "Photon";
  if (normalized === "nominatim") return "Nominatim";
  return "mapa";
}

function getDeliveryLocationMethodCopy({ precision = "", source = "", includeProvider = true } = {}) {
  const normalizedPrecision = normalizeDeliveryMetadataValue(precision);
  const sourceLabel = includeProvider && source
    ? ` (${formatGeocoderSourceLabel(source)})`
    : "";

  if (normalizedPrecision === "manual_zone") {
    return "Taxa confirmada para este endere\u00e7o.";
  }

  if (normalizedPrecision === "exact") {
    return `Localiza\u00e7\u00e3o precisa: n\u00famero do endere\u00e7o confirmado${sourceLabel}.`;
  }

  if (normalizedPrecision === "street") {
    return `Localiza\u00e7\u00e3o validada: ponto da rua confirmado${sourceLabel}.`;
  }

  if (normalizedPrecision === "approximate") {
    return `Localiza\u00e7\u00e3o aproximada validada${sourceLabel}.`;
  }

  if (normalizedPrecision) {
    return `Localiza\u00e7\u00e3o validada pelo servidor${sourceLabel}.`;
  }

  return "";
}

function normalizeDeliveryMetadataValue(value) {
  return normalizeCompareText(value).replace(/[\s-]+/g, "_");
}

function isManualZoneMetadata({ precision = "", source = "" } = {}) {
  const normalizedPrecision = normalizeDeliveryMetadataValue(precision);
  const normalizedSource = normalizeDeliveryMetadataValue(source);

  return normalizedPrecision === "manual_zone" || normalizedSource === "manual_zone_registry";
}

function getDeliveryQuoteDistanceCopy(quote = {}) {
  const normalizedPrecision = normalizeDeliveryMetadataValue(quote?.locationPrecision);

  if (Number(quote?.routeDistanceKm) > 0 && normalizedPrecision === "exact") {
    return `Dist\u00e2ncia real por rota: ${formatDistanceKm(quote.routeDistanceKm)}.`;
  }

  if (Number(quote?.distanceKm) > 0) {
    return normalizedPrecision === "street" || normalizedPrecision === "approximate"
      ? `Dist\u00e2ncia aproximada da base: ${formatDistanceKm(quote.distanceKm)}.`
      : `Dist\u00e2ncia calculada: ${formatDistanceKm(quote.distanceKm)}.`;
  }

  return "";
}

function buildDeliveryAddressKey(values = {}) {
  return [
    normalizeCep(values.cep),
    normalizeAddressToken(values.neighborhood),
    normalizeAddressToken(values.street),
    normalizeAddressToken(values.number),
    normalizeAddressToken(values.city),
    normalizeText(values.state).toUpperCase()
  ].join("|");
}

function isDeliveryQuoteFresh(state = deliveryState) {
  if (!state || state.status !== "ready" || !state.quoteToken || !state.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(state.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return expiresAt - DELIVERY_QUOTE_EXPIRY_BUFFER_MS > Date.now();
}

function hasCompleteDeliveryAddress(values = getDeliveryValues()) {
  return (
    normalizeCep(values.cep).length === 8
    && Boolean(normalizeText(values.street))
    && Boolean(normalizeText(values.number))
  );
}

function clearScheduledAutoDeliveryQuote() {
  if (deliveryAutoQuoteTimer) {
    window.clearTimeout(deliveryAutoQuoteTimer);
    deliveryAutoQuoteTimer = 0;
  }
}

function cancelActiveDeliveryQuoteRequest(reason = "cancelled") {
  if (!activeDeliveryQuoteRequest) {
    return;
  }

  activeDeliveryQuoteRequest.cancelReason = reason;
  activeDeliveryQuoteRequest.controller.abort();
  activeDeliveryQuoteRequest.cleanup();
  activeDeliveryQuoteRequest = null;
}

function cancelActiveViaCepLookup(reason = "cancelled") {
  if (!activeViaCepLookup) {
    return;
  }

  activeViaCepLookup.cancelReason = reason;
  activeViaCepLookup.controller.abort();
  activeViaCepLookup.cleanup();
  activeViaCepLookup = null;
}

function scheduleAutoDeliveryQuote(reason = "address_change") {
  clearScheduledAutoDeliveryQuote();

  if (getCurrentFulfillmentMode() === "pickup") {
    return;
  }

  const values = getDeliveryValues();
  if (!hasCompleteDeliveryAddress(values)) {
    return;
  }

  const nextAddressKey = buildDeliveryAddressKey(values);
  if (
    deliveryState.status === "ready"
    && deliveryState.addressKey === nextAddressKey
    && isDeliveryQuoteFresh(deliveryState)
  ) {
    return;
  }

  deliveryAutoQuoteTimer = window.setTimeout(() => {
    deliveryAutoQuoteTimer = 0;
    requestDeliveryQuote({
      showMessage: false,
      quietSuccess: true,
      reason
    }).catch(error => {
      logCheckoutWarn("Falha silenciosa ao recalcular entrega.", error);
    });
  }, DELIVERY_AUTO_CALCULATE_DEBOUNCE_MS);
}

function resolveDeliveryQuoteApiUrl() {
  const currentHref = String(window?.location?.href || "").trim();
  const currentOrigin = String(window?.location?.origin || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  const isLocalPage = !isHttpPage || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);

  if (isLocalPage) {
    const baseUrl = resolveOrderTicketBaseUrl();
    if (baseUrl) {
      return new URL(DELIVERY_QUOTE_API_URL, baseUrl).toString();
    }
  }

  return DELIVERY_QUOTE_API_URL;
}

function resolveDeliveryAreasApiUrl() {
  const currentHref = String(window?.location?.href || "").trim();
  const currentOrigin = String(window?.location?.origin || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  const isLocalPage = !isHttpPage || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);

  if (isLocalPage) {
    const baseUrl = resolveOrderTicketBaseUrl();
    if (baseUrl) {
      return new URL(DELIVERY_AREAS_API_URL, baseUrl).toString();
    }
  }

  return DELIVERY_AREAS_API_URL;
}

function resolveOrderTicketApiUrl() {
  const currentHref = String(window?.location?.href || "").trim();
  const currentOrigin = String(window?.location?.origin || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  const isLocalPage = !isHttpPage || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);

  if (isLocalPage) {
    const baseUrl = resolveOrderTicketBaseUrl();
    if (baseUrl) {
      return new URL(ORDER_TICKET_API_URL, baseUrl).toString();
    }
  }

  return ORDER_TICKET_API_URL;
}

function resolveInventoryStatusApiUrl() {
  const currentHref = String(window?.location?.href || "").trim();
  const currentOrigin = String(window?.location?.origin || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  const isLocalPage = !isHttpPage || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);

  if (isLocalPage) {
    const baseUrl = resolveOrderTicketBaseUrl();
    if (baseUrl) {
      return new URL(INVENTORY_STATUS_API_URL, baseUrl).toString();
    }
  }

  return INVENTORY_STATUS_API_URL;
}

function formatStoreTimeLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

function getStoreDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatStoreShortDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TIME_ZONE,
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function getStoreClockParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const weekdayToken = parts.find(part => part.type === "weekday")?.value || "Mon";
  const hour = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minute = Number(parts.find(part => part.type === "minute")?.value || 0);

  return {
    dayIndex: STORE_WEEKDAY_TOKENS[weekdayToken] ?? 1,
    hour,
    minute,
    currentMinutes: hour * 60 + minute
  };
}

function getRelativeStoreDayOffset(targetDate, referenceDate = new Date()) {
  const targetKey = getStoreDateKey(targetDate);
  const referenceKey = getStoreDateKey(referenceDate);

  if (targetKey === referenceKey) {
    return 0;
  }

  const tomorrow = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
  if (targetKey === getStoreDateKey(tomorrow)) {
    return 1;
  }

  return null;
}

function getActiveStoreTemporaryClosure(now = new Date()) {
  if (!STORE_TEMPORARY_CLOSURE) {
    return null;
  }

  if (now.getTime() >= STORE_TEMPORARY_CLOSURE.reopenAt.getTime()) {
    return null;
  }

  const reopenClock = getStoreClockParts(STORE_TEMPORARY_CLOSURE.reopenAt);

  return {
    ...STORE_TEMPORARY_CLOSURE,
    reopenDayIndex: reopenClock.dayIndex,
    reopenMinutes: reopenClock.currentMinutes
  };
}

function getNextStoreOpening(dayIndex, currentMinutes) {
  for (let offset = 0; offset < 8; offset += 1) {
    const targetDayIndex = (dayIndex + offset) % 7;
    const schedule = STORE_HOURS[targetDayIndex];
    if (!schedule) continue;

    if (offset === 0 && currentMinutes < schedule.openMinutes) {
      return {
        dayIndex: targetDayIndex,
        openMinutes: schedule.openMinutes,
        offset
      };
    }

    if (offset > 0) {
      return {
        dayIndex: targetDayIndex,
        openMinutes: schedule.openMinutes,
        offset
      };
    }
  }

  return null;
}

function getStoreAvailability(now = new Date()) {
  const clock = getStoreClockParts(now);
  const todaySchedule = STORE_HOURS[clock.dayIndex] || null;
  const scheduleEnforced = STORE_SCHEDULE_MODE === "live";
  const isScheduledOpen = Boolean(todaySchedule)
    && clock.currentMinutes >= todaySchedule.openMinutes
    && clock.currentMinutes <= todaySchedule.closeMinutes;
  const overrideMode = normalizeStoreStatusOverrideMode(storeStatusState.overrideMode);
  const temporaryClosure = getActiveStoreTemporaryClosure(now);

  if (overrideMode === "force_open") {
    return {
      ...clock,
      todaySchedule,
      scheduleEnforced,
      isScheduledOpen,
      isOpen: true,
      nextOpen: null,
      manualOverrideMode: overrideMode,
      manualOverrideActive: true
    };
  }

  if (overrideMode === "force_closed") {
    return {
      ...clock,
      todaySchedule,
      scheduleEnforced,
      isScheduledOpen,
      isOpen: false,
      nextOpen: null,
      manualOverrideMode: overrideMode,
      manualOverrideActive: true
    };
  }

  if (temporaryClosure) {
    return {
      ...clock,
      todaySchedule,
      scheduleEnforced,
      isScheduledOpen,
      isOpen: false,
      manualOverrideMode: overrideMode,
      manualOverrideActive: false,
      nextOpen: {
        type: "temporary_closure",
        date: temporaryClosure.reopenAt,
        dayIndex: temporaryClosure.reopenDayIndex,
        openMinutes: temporaryClosure.reopenMinutes,
        offset: getRelativeStoreDayOffset(temporaryClosure.reopenAt, now)
      },
      temporaryClosure
    };
  }

  const isOpen = !scheduleEnforced || isScheduledOpen;

  return {
    ...clock,
    todaySchedule,
    scheduleEnforced,
    isScheduledOpen,
    manualOverrideMode: overrideMode,
    manualOverrideActive: false,
    isOpen,
    nextOpen: getNextStoreOpening(clock.dayIndex, clock.currentMinutes)
  };
}

function formatNextOpeningMessage(nextOpen) {
  if (!nextOpen) {
    return "Consulte a loja para o pr\u00f3ximo hor\u00e1rio.";
  }

  if (nextOpen.type === "temporary_closure" && nextOpen.date instanceof Date) {
    const timeLabel = formatStoreTimeLabel(nextOpen.openMinutes);
    const relativeDayOffset = nextOpen.offset ?? getRelativeStoreDayOffset(nextOpen.date);

    if (relativeDayOffset === 0) {
      return `A pr\u00f3xima abertura \u00e9 hoje, \u00e0s ${timeLabel}.`;
    }

    if (relativeDayOffset === 1) {
      return `A pr\u00f3xima abertura \u00e9 amanh\u00e3, \u00e0s ${timeLabel}.`;
    }

    return `A pr\u00f3xima abertura \u00e9 ${STORE_WEEKDAY_LABELS[nextOpen.dayIndex]}, ${formatStoreShortDateLabel(nextOpen.date)}, \u00e0s ${timeLabel}.`;
  }

  const timeLabel = formatStoreTimeLabel(nextOpen.openMinutes);

  if (nextOpen.offset === 0) {
    return `A pr\u00f3xima abertura \u00e9 hoje, \u00e0s ${timeLabel}.`;
  }

  if (nextOpen.offset === 1) {
    return `A pr\u00f3xima abertura \u00e9 amanh\u00e3, \u00e0s ${timeLabel}.`;
  }

  return `A pr\u00f3xima abertura \u00e9 ${STORE_WEEKDAY_LABELS[nextOpen.dayIndex]}, \u00e0s ${timeLabel}.`;
}

function isStoreManuallyForcedOpen(availability = getStoreAvailability()) {
  return availability.manualOverrideMode === "force_open";
}

function isStoreManuallyForcedClosed(availability = getStoreAvailability()) {
  return availability.manualOverrideMode === "force_closed";
}

function getStoreHeroStatusCopy(availability = getStoreAvailability()) {
  if (isStoreManuallyForcedOpen(availability)) {
    return {
      pill: "Pedidos abertos manualmente",
      title: "A Galaxy Burger esta aceitando pedidos agora",
      message: "A loja liberou os pedidos manualmente pelo painel administrativo."
    };
  }

  if (isStoreManuallyForcedClosed(availability)) {
    return {
      pill: "Fechada no momento",
      title: "A Galaxy Burger esta fechada agora",
      message: "A loja esta fechada no momento."
    };
  }

  if (!availability.scheduleEnforced) {
    return {
      pill: "Teste liberado",
      title: "A Galaxy Burger esta liberada para testes",
      message: "Bloqueio por horario desativado temporariamente para validacao do checkout e apresentacao ao cliente."
    };
  }

  if (availability.isOpen) {
    return {
      pill: "Aberta no momento",
      title: "A Galaxy Burger esta aberta agora",
      message: `Recebendo pedidos ate ${formatStoreTimeLabel(availability.todaySchedule?.closeMinutes || 0)}.`
    };
  }

  return {
    pill: "Fechada no momento",
    title: "A Galaxy Burger esta fechada agora",
    message: formatNextOpeningMessage(availability.nextOpen)
  };
}

function getStoreClosedOrderMessage(availability = getStoreAvailability()) {
  if (isStoreManuallyForcedClosed(availability)) {
    return "A Galaxy Burger esta fechada no momento.";
  }

  return `A Galaxy Burger est\u00e1 fechada agora. ${formatNextOpeningMessage(availability.nextOpen)}`;
}

function ensureStoreIsOpen(showMessage = true) {
  const availability = getStoreAvailability();
  updateStoreStatusUI(availability);

  if (availability.isOpen) {
    return true;
  }

  if (showMessage) {
    showToast(getStoreClosedOrderMessage(availability));
  }

  return false;
}

function getDeliveryFields() {
  return {
    cep: document.getElementById("customer-cep"),
    street: document.getElementById("customer-street"),
    number: document.getElementById("customer-number"),
    neighborhood: document.getElementById("customer-neighborhood"),
    neighborhoodHelper: document.getElementById("customer-neighborhood-helper"),
    complement: document.getElementById("customer-complement"),
    reference: document.getElementById("customer-reference"),
    city: document.getElementById("customer-city"),
    state: document.getElementById("customer-state"),
    address: document.getElementById("customer-address"),
    distanceRange: document.getElementById("delivery-distance-range"),
    quoteSummary: document.getElementById("delivery-quote-summary"),
    feeFeedback: document.getElementById("delivery-fee-feedback"),
    feeLine: document.getElementById("modal-delivery-fee-line"),
    totalNote: document.getElementById("delivery-total-note"),
    totalLabel: document.getElementById("modal-cart-total-label"),
    estimateAck: document.getElementById("delivery-estimate-ack"),
    estimateTerms: document.getElementById("delivery-estimate-terms"),
    searchCepButton: document.getElementById("search-cep-btn"),
    calculateDeliveryButton: document.getElementById("calculate-delivery-btn")
  };
}

function getCheckoutContactFields() {
  return {
    name: document.getElementById("customer-name"),
    phone: document.getElementById("customer-phone"),
    notes: document.getElementById("order-notes")
  };
}

function getSelectedDeliveryArea() {
  const field = getDeliveryFields().neighborhood;
  if (!field) {
    return null;
  }

  const datasetAreaId = normalizeText(field.dataset.savedAreaId || "");
  const byId = datasetAreaId ? getDeliveryAreaByIdLocal(datasetAreaId) : null;
  if (byId) {
    return byId;
  }

  return findDeliveryAreaByNameLocal(field.value || field.dataset.savedAreaName || "");
}

function setNeighborhoodHelperCopy(message, tone = "") {
  const helper = getDeliveryFields().neighborhoodHelper;
  if (!helper) {
    return;
  }

  helper.textContent = normalizeText(message);
  helper.classList.remove("is-success", "is-warning", "is-error");

  if (tone === "success") helper.classList.add("is-success");
  if (tone === "warning") helper.classList.add("is-warning");
  if (tone === "error") helper.classList.add("is-error");
}

function syncNeighborhoodHelperFromSelection() {
  const field = getDeliveryFields().neighborhood;
  const selectedArea = getSelectedDeliveryArea();
  const resolvedNeighborhood = normalizeText(field?.value || field?.dataset.savedAreaName || "");

  if (!selectedArea) {
    if (resolvedNeighborhood) {
      setNeighborhoodHelperCopy(`Bairro identificado pelo CEP: ${resolvedNeighborhood}. Agora valide a taxa de entrega.`, "success");
      return;
    }

    setNeighborhoodHelperCopy("Informe um CEP valido para identificar o bairro automaticamente.");
    return;
  }

  if (selectedArea.status === "active") {
    const zoneLabel = normalizeText(selectedArea.zoneLabel || DELIVERY_ZONE_LABELS[selectedArea.zoneId]);
    setNeighborhoodHelperCopy(
      `Entrega ativa para ${selectedArea.name}. ${zoneLabel || `Taxa cadastrada: ${formatCurrency(selectedArea.fee)}.`}`,
      "success"
    );
    return;
  }

  if (selectedArea.status === "pickup_only") {
    setNeighborhoodHelperCopy("Para esta regiao, no momento trabalhamos apenas com retirada no local.", "warning");
    return;
  }

  setNeighborhoodHelperCopy("No momento nao entregamos nessa regiao. Voce pode escolher retirada no local.", "error");
}

function syncDeliveryAreaSelection(areaId = "", areaName = "") {
  const field = getDeliveryFields().neighborhood;
  if (!field) {
    return null;
  }

  const normalizedAreaId = normalizeText(areaId);
  const nextArea = getDeliveryAreaByIdLocal(normalizedAreaId) || findDeliveryAreaByNameLocal(areaName);

  field.value = normalizeText(nextArea?.name || areaName);
  field.dataset.savedAreaId = nextArea?.id || "";
  field.dataset.savedAreaName = normalizeText(nextArea?.name || areaName);
  syncNeighborhoodHelperFromSelection();
  return nextArea || null;
}

function renderDeliveryAreaOptions() {
  const field = getDeliveryFields().neighborhood;
  if (!field) {
    return;
  }

  const currentValue = normalizeText(field.dataset.savedAreaId || "");
  const currentName = normalizeText(field.dataset.savedAreaName || "");

  const restoredArea = syncDeliveryAreaSelection(currentValue, currentName);
  if (restoredArea) {
    field.dataset.savedAreaId = restoredArea.id;
    field.dataset.savedAreaName = restoredArea.name;
    field.value = restoredArea.name;
  } else {
    field.dataset.savedAreaId = "";
    field.dataset.savedAreaName = currentName;
    field.value = currentName;
  }

  syncNeighborhoodHelperFromSelection();
}

function getCurrentFulfillmentMode() {
  return document.getElementById("order-fulfillment")?.value || "delivery";
}

function getPaymentFields() {
  return {
    field: document.getElementById("payment-method"),
    grid: document.querySelector(".payment-grid"),
    buttons: Array.from(document.querySelectorAll(".payment-btn"))
  };
}

function logCheckoutInfo(message, details) {
  if (details !== undefined) {
    console.info(`${CHECKOUT_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.info(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function logCheckoutWarn(message, details) {
  if (details !== undefined) {
    console.warn(`${CHECKOUT_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.warn(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function logCheckoutError(message, error) {
  if (error !== undefined) {
    console.error(`${CHECKOUT_LOG_PREFIX} ${message}`, error);
    return;
  }

  console.error(`${CHECKOUT_LOG_PREFIX} ${message}`);
}

function setFieldInvalid(field) {
  if (!field) return;
  field.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");
}

function clearFieldInvalid(field) {
  if (!field) return;
  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");
}

function setEstimateTermsInvalid(container, checkbox) {
  if (container) container.classList.add("is-invalid");
  if (checkbox) checkbox.setAttribute("aria-invalid", "true");
}

function clearEstimateTermsInvalid(container, checkbox) {
  if (container) container.classList.remove("is-invalid");
  if (checkbox) checkbox.removeAttribute("aria-invalid");
}

function setPaymentInvalid() {
  const payment = getPaymentFields();
  if (payment.grid) payment.grid.classList.add("is-invalid");
  payment.buttons.forEach(button => button.setAttribute("aria-invalid", "true"));
}

function clearPaymentInvalid() {
  const payment = getPaymentFields();
  if (payment.grid) payment.grid.classList.remove("is-invalid");
  payment.buttons.forEach(button => button.removeAttribute("aria-invalid"));
}

function showToast(message) {
  let toast = document.getElementById("toast-message");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-message";
    toast.className = "toast-message";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function getCashChangeFields() {
  return {
    panel: document.getElementById("cash-change-panel"),
    typeInputs: Array.from(document.querySelectorAll('input[name="cash-change-type"]')),
    valueWrap: document.getElementById("cash-change-value-wrap"),
    valueInput: document.getElementById("cash-change-value")
  };
}

function getSelectedCashChangeType() {
  const { typeInputs } = getCashChangeFields();
  return typeInputs.find(input => input.checked)?.value || "no-change";
}

function normalizeCurrencyInput(value) {
  const cleaned = String(value || "").replace(/[^\d,]/g, "");
  const firstCommaIndex = cleaned.indexOf(",");

  if (firstCommaIndex === -1) {
    return cleaned;
  }

  const integerPart = cleaned.slice(0, firstCommaIndex);
  const decimalPart = cleaned.slice(firstCommaIndex + 1).replace(/,/g, "").slice(0, 2);
  return `${integerPart},${decimalPart}`;
}

function parseCurrencyInput(value) {
  const cleaned = normalizeCurrencyInput(value).replace(/\./g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrencyInputValue(value) {
  const amount = typeof value === "number" ? value : parseCurrencyInput(value);
  if (!amount) return "";

  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateCashChangeUI() {
  const payment = document.getElementById("payment-method")?.value || "";
  const fields = getCashChangeFields();
  const isCash = payment === "dinheiro";
  const needsChange = isCash && getSelectedCashChangeType() === "need-change";

  if (fields.panel) {
    fields.panel.hidden = !isCash;
  }

  if (fields.valueWrap) {
    fields.valueWrap.hidden = !needsChange;
  }

  if (!needsChange) {
    clearFieldInvalid(fields.valueInput);
  }
}

function getCashChangeSummary(orderTotal, showMessage = true) {
  const payment = document.getElementById("payment-method")?.value || "";
  const fields = getCashChangeFields();

  clearFieldInvalid(fields.valueInput);

  if (payment !== "dinheiro") {
    return {
      paymentLabel: formatPaymentLabel(payment),
      cashChangeText: ""
    };
  }

  const changeType = getSelectedCashChangeType();

  if (changeType !== "need-change") {
    return {
      paymentLabel: "Dinheiro",
      cashChangeText: "N\u00e3o precisa de troco."
    };
  }

  const changeAmount = parseCurrencyInput(fields.valueInput?.value);

  if (!changeAmount) {
    if (showMessage) {
      setFieldInvalid(fields.valueInput);
      fields.valueInput?.focus();
      showToast("Informe o valor para troco.");
    }
    return null;
  }

  if (changeAmount < orderTotal) {
    if (showMessage) {
      setFieldInvalid(fields.valueInput);
      fields.valueInput?.focus();
      showToast(`O troco precisa ser para um valor igual ou maior que ${formatCurrency(orderTotal)}.`);
    }
    return null;
  }

  if (fields.valueInput) {
    fields.valueInput.value = formatCurrencyInputValue(changeAmount);
  }

  return {
    paymentLabel: "Dinheiro",
    cashChangeText: `Troco para ${formatCurrency(changeAmount)}`
  };
}

function buildFullAddress() {
  const fields = getDeliveryFields();

  const cep = formatCep(fields.cep?.value || "");
  const street = normalizeText(fields.street?.value);
  const number = normalizeText(fields.number?.value);
  const neighborhood = normalizeText(fields.neighborhood?.value || fields.neighborhood?.dataset.savedAreaName || "");
  const complement = normalizeText(fields.complement?.value);
  const reference = normalizeText(fields.reference?.value);
  const city = normalizeText(fields.city?.value || CONFIGURED_SERVICE_AREA.city);
  const state = normalizeText(fields.state?.value || CONFIGURED_SERVICE_AREA.state).toUpperCase();

  const parts = [];

  if (street) parts.push(number ? `${street}, ${number}` : street);
  if (complement) parts.push(complement);
  if (reference) parts.push(`Ref.: ${reference}`);
  if (neighborhood) parts.push(neighborhood);
  if (city || state) parts.push([city, state].filter(Boolean).join(" - "));
  if (cep) parts.push(`CEP ${cep}`);

  return parts.join(" | ");
}

function syncDeliveryAddressField() {
  const fields = getDeliveryFields();
  const address = buildFullAddress();

  if (fields.address) {
    fields.address.value = address;
  }

  return address;
}

function getDeliveryValues() {
  const fields = getDeliveryFields();

  return {
    deliveryAreaId: normalizeText(deliveryState.deliveryAreaId || fields.neighborhood?.dataset.savedAreaId || ""),
    cep: normalizeCep(fields.cep?.value),
    street: normalizeText(fields.street?.value),
    number: normalizeText(fields.number?.value),
    neighborhood: normalizeText(fields.neighborhood?.value || fields.neighborhood?.dataset.savedAreaName || ""),
    complement: normalizeText(fields.complement?.value),
    reference: normalizeText(fields.reference?.value),
    city: normalizeText(fields.city?.value || CONFIGURED_SERVICE_AREA.city),
    state: normalizeText(fields.state?.value || CONFIGURED_SERVICE_AREA.state).toUpperCase(),
    distanceRange: normalizeText(fields.distanceRange?.value),
    estimateAccepted: Boolean(fields.estimateAck?.checked)
  };
}

function isInvalidHouseNumberValue(value) {
  return INVALID_HOUSE_NUMBER_VALUES.has(normalizeAddressToken(value));
}

function validateAddressFields(showMessage = true) {
  const fields = getDeliveryFields();
  const values = getDeliveryValues();

  const required = [
    { field: fields.cep, value: values.cep && values.cep.length === 8, message: "Informe um CEP valido para identificar o bairro." },
    { field: fields.street, value: values.street, message: "Informe a rua." },
    { field: fields.number, value: values.number, message: "Informe o numero." }
  ];

  const missing = required.find(item => !item.value);

  required.forEach(item => clearFieldInvalid(item.field));

  if (missing) {
    setFieldInvalid(missing.field);
    missing.field?.focus();

    if (showMessage) {
      logCheckoutWarn("Checkout bloqueado: endere\u00e7o incompleto.", { missingField: missing.field?.id || "unknown" });
      showToast(missing.message || DELIVERY_IDLE_MESSAGE);
      setDeliveryState(createDeliveryState({
        status: "idle",
        distanceRange: values.distanceRange || "",
        address: syncDeliveryAddressField(),
        message: missing.message || DELIVERY_IDLE_MESSAGE,
      }));
    }

    return false;
  }

  if (isInvalidHouseNumberValue(values.number)) {
    setFieldInvalid(fields.number);
    fields.number?.focus();

    if (showMessage) {
      logCheckoutWarn("Checkout bloqueado: numero invalido para entrega.");
      showToast("Informe o n\u00famero da resid\u00eancia para calcular a entrega.");
      setDeliveryState(createDeliveryState({
        status: "idle",
        distanceRange: values.distanceRange || "",
        address: syncDeliveryAddressField(),
        message: "Informe o n\u00famero da resid\u00eancia para calcular a entrega."
      }));
    }

    return false;
  }

  return true;
}

function clearDeliveryQuote(reasonMessage = DELIVERY_IDLE_MESSAGE) {
  const fields = getDeliveryFields();

  clearScheduledAutoDeliveryQuote();
  cancelActiveDeliveryQuoteRequest("state_reset");

  if (fields.distanceRange) {
    fields.distanceRange.value = "";
    clearFieldInvalid(fields.distanceRange);
  }

  if (fields.estimateAck) {
    fields.estimateAck.checked = false;
    clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
  }

  setDeliveryState(createDeliveryState({
    address: syncDeliveryAddressField(),
    message: reasonMessage,
  }));

  updateCartTotals();
}

function applyValidatedAddressToFields(address = {}) {
  const fields = getDeliveryFields();

  if (fields.cep && address.cep) fields.cep.value = formatCep(address.cep);
  if (fields.street && address.street) fields.street.value = address.street;
  if (fields.neighborhood && address.neighborhood) {
    fields.neighborhood.value = address.neighborhood;
    fields.neighborhood.dataset.savedAreaName = address.neighborhood;
  }
  if (fields.city && address.city) fields.city.value = address.city;
  if (fields.state && address.state) fields.state.value = address.state;
}

function createDeliveryRequestError(message, code, status = 500, payload = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.payload = payload;
  return error;
}

function normalizeDeliveryQuotePayload(payload, values) {
  const status = ["ready", "out_of_range", "blocked", "pickup_only"].includes(payload?.status)
    ? payload.status
    : "ready";
  const isDeliveryUnavailable = ["out_of_range", "blocked", "pickup_only"].includes(status);
  const fee = Number(payload?.fee);
  const isManualZone = isManualZoneMetadata({
    precision: payload?.locationPrecision,
    source: payload?.geocoderSource
  });
  const normalizedPrecision = normalizeDeliveryMetadataValue(payload?.locationPrecision);
  const parsedDistanceKm = Number(payload?.distanceKm);
  const parsedRouteDistanceKm = Number(payload?.routeDistanceKm ?? payload?.distanceKm);
  const distanceKm = Number.isFinite(parsedDistanceKm) && parsedDistanceKm > 0 ? parsedDistanceKm : 0;
  const routeDistanceKm = Number.isFinite(parsedRouteDistanceKm) && parsedRouteDistanceKm > 0
    ? parsedRouteDistanceKm
    : distanceKm;

  if (!isManualZone && (!Number.isFinite(distanceKm) || distanceKm <= 0)) {
    throw createDeliveryRequestError(
      "A resposta da entrega voltou sem uma dist\u00e2ncia v\u00e1lida.",
      "delivery_quote_invalid_distance",
      502,
      payload
    );
  }

  if (
    !isManualZone
    && normalizedPrecision === "exact"
    && (!Number.isFinite(routeDistanceKm) || routeDistanceKm <= 0)
  ) {
    throw createDeliveryRequestError(
      "A resposta da entrega voltou sem uma rota v\u00e1lida.",
      "delivery_quote_invalid_route",
      502,
      payload
    );
  }

  if (!isDeliveryUnavailable) {
    if (!Number.isFinite(fee) || fee <= 0 || ![DELIVERY_FEE_LOCAL, DELIVERY_FEE_EXTENDED].includes(fee)) {
      throw createDeliveryRequestError(
        "A resposta da entrega voltou com uma taxa fora da regra da loja.",
        "delivery_quote_invalid_fee",
        502,
        payload
      );
    }

    if (!payload?.quote?.token || !payload?.quote?.code || !payload?.quote?.expiresAt) {
      throw createDeliveryRequestError(
        "A resposta da entrega voltou sem a validacao completa da taxa.",
        "delivery_quote_invalid_token",
        502,
        payload
      );
    }
  }

  const validatedAddress = {
    ...values,
    ...(payload?.address || {})
  };

  validatedAddress.complement = values.complement;
  validatedAddress.reference = values.reference;

  return {
    status,
    isDeliveryUnavailable,
    fee: isDeliveryUnavailable ? 0 : fee,
    distanceKm,
    routeDistanceKm,
    validatedAddress,
    deliveryArea: {
      id: normalizeText(payload?.deliveryArea?.id || values.deliveryAreaId),
      name: normalizeText(payload?.deliveryArea?.name || validatedAddress.neighborhood),
      status: normalizeText(payload?.deliveryArea?.status || status),
      note: normalizeText(payload?.deliveryArea?.note)
    }
  };
}

async function fetchDeliveryQuote(values, { signal } = {}) {
  const response = await fetch(resolveDeliveryQuoteApiUrl(), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      deliveryAreaId: normalizeText(values.deliveryAreaId),
      cep: normalizeCep(values.cep),
      street: normalizeText(values.street),
      number: normalizeText(values.number),
      neighborhood: normalizeText(values.neighborhood),
      complement: normalizeText(values.complement),
      reference: normalizeText(values.reference),
      city: normalizeText(values.city),
      state: normalizeText(values.state).toUpperCase()
    })
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    let message = payload?.message || "N\u00e3o foi poss\u00edvel validar a entrega agora.";
    let code = payload?.code || "delivery_quote_failed";

    if (response.status === 404) {
      message = "A API de entrega ainda n\u00e3o est\u00e1 publicada neste ambiente. Fa\u00e7a um novo deploy na Vercel para liberar a valida\u00e7\u00e3o.";
      code = "delivery_quote_route_missing";
    }

    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function verifyDeliveryQuoteToken(token, addressKey = "", { signal } = {}) {
  const url = new URL(resolveDeliveryQuoteApiUrl(), window.location.origin);
  url.searchParams.set("token", token);
  if (addressKey) {
    url.searchParams.set("addressKey", addressKey);
  }

  const timedRequest = signal ? null : createTimedRequest(DELIVERY_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(url.toString(), {
      signal: signal || timedRequest?.controller.signal,
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (timedRequest?.didTimeout && isAbortError(error)) {
      throw createDeliveryRequestError(
        "A confirma\u00e7\u00e3o da taxa demorou mais do que o esperado.",
        "delivery_quote_verify_timeout",
        504
      );
    }

    throw error;
  } finally {
    timedRequest?.cleanup();
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !payload?.valid) {
    let message = payload?.message || "N\u00e3o foi poss\u00edvel confirmar a cota\u00e7\u00e3o da entrega.";
    let code = payload?.code || "delivery_quote_verify_failed";

    if (response.status === 404) {
      message = "A API de entrega ainda n\u00e3o est\u00e1 publicada neste ambiente. Fa\u00e7a um novo deploy na Vercel para liberar a valida\u00e7\u00e3o.";
      code = "delivery_quote_route_missing";
    }

    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function buildCartPayloadForServer() {
  return cart.map(item => ({
    productId: normalizeText(item.productId),
    quantity: Math.max(1, Math.round(normalizeMoneyValue(item.quantity, 0))),
    selectedOptionIds: Array.isArray(item.selectedOptionIds)
      ? item.selectedOptionIds.map(optionId => normalizeText(optionId)).filter(Boolean)
      : []
  }));
}

async function prepareValidatedOrderTicket(payload, { signal } = {}) {
  const timedRequest = signal ? null : createTimedRequest(DELIVERY_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(resolveOrderTicketApiUrl(), {
      method: "POST",
      signal: signal || timedRequest?.controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (timedRequest?.didTimeout && isAbortError(error)) {
      throw createDeliveryRequestError(
        "A preparação do pedido demorou mais do que o esperado.",
        "order_ticket_timeout",
        504
      );
    }

    throw error;
  } finally {
    timedRequest?.cleanup();
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.ok || !data?.order) {
    const error = new Error(data?.message || "Não foi possível preparar a comanda agora.");
    error.code = data?.code || "order_ticket_prepare_failed";
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function normalizeInventoryProductsPayload(payload) {
  if (Array.isArray(payload?.products)) {
    return payload.products;
  }

  if (Array.isArray(payload?.inventory?.products)) {
    return payload.inventory.products;
  }

  return [];
}

function normalizeInventoryRealtimePayload(payload) {
  const productId = normalizeText(payload?.productId);
  if (!productId || !CATALOG_PRODUCT_MAP.has(productId)) {
    return null;
  }

  return {
    productId,
    available: Boolean(payload?.available),
    updatedAt: normalizeText(payload?.updatedAt) || new Date().toISOString()
  };
}

function applyCatalogInventorySnapshot(payload, { notify = true, reason = "inventory_sync" } = {}) {
  const inventoryProducts = normalizeInventoryProductsPayload(payload);
  if (!inventoryProducts.length) {
    return [];
  }

  const nextInventoryStatusMap = new Map(catalogInventoryStatusMap);

  inventoryProducts.forEach(product => {
    const productId = normalizeText(product?.id);
    if (!productId || !CATALOG_PRODUCT_MAP.has(productId)) {
      return;
    }

    nextInventoryStatusMap.set(productId, {
      available: Boolean(product.available),
      stockUpdatedAt: normalizeText(product.stockUpdatedAt || product.updatedAt)
    });
  });

  catalogInventoryStatusMap = nextInventoryStatusMap;
  const removedItems = purgeUnavailableCartItems({ notify, reason });
  updateUI();
  requestExpandableCardDescriptionsSync();
  return removedItems;
}

function applyCatalogInventoryPatch(payload, { notify = true, reason = "inventory_patch" } = {}) {
  const normalizedPayload = normalizeInventoryRealtimePayload(payload);
  if (!normalizedPayload) {
    return [];
  }

  const currentEntry = getCatalogInventoryEntry(normalizedPayload.productId);
  if (
    currentEntry
    && Boolean(currentEntry.available) === normalizedPayload.available
    && normalizeText(currentEntry.stockUpdatedAt) === normalizedPayload.updatedAt
  ) {
    return [];
  }

  const nextInventoryStatusMap = new Map(catalogInventoryStatusMap);
  nextInventoryStatusMap.set(normalizedPayload.productId, {
    available: normalizedPayload.available,
    stockUpdatedAt: normalizedPayload.updatedAt
  });

  catalogInventoryStatusMap = nextInventoryStatusMap;
  const removedItems = purgeUnavailableCartItems({ notify, reason });
  updateUI();
  requestExpandableCardDescriptionsSync();
  return removedItems;
}

function createInventoryRealtimeChannel() {
  try {
    return typeof window.BroadcastChannel === "function"
      ? new window.BroadcastChannel(INVENTORY_SYNC_CHANNEL_NAME)
      : null;
  } catch {
    return null;
  }
}

function parseInventoryRealtimePayload(rawValue) {
  try {
    return normalizeInventoryRealtimePayload(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function handleRealtimeInventoryUpdate(payload, { notify = true, reason = "inventory_realtime" } = {}) {
  const normalizedPayload = normalizeInventoryRealtimePayload(payload);
  if (!normalizedPayload) {
    return;
  }

  applyCatalogInventoryPatch(normalizedPayload, { notify, reason });
  window.setTimeout(() => {
    refreshCatalogAvailability({
      notify,
      quiet: true,
      reason: `${reason}_confirm`
    });
  }, 0);
}

async function fetchInventoryStatus({ signal } = {}) {
  if (activeInventoryStatusRequest?.promise) {
    return activeInventoryStatusRequest.promise;
  }

  const request = {};
  activeInventoryStatusRequest = request;
  request.promise = (async () => {
    const timedRequest = signal ? null : createTimedRequest(INVENTORY_REQUEST_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(resolveInventoryStatusApiUrl(), {
        signal: signal || timedRequest?.controller.signal,
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      if (timedRequest?.didTimeout && isAbortError(error)) {
        throw createDeliveryRequestError(
          "A atualização do estoque demorou mais do que o esperado.",
          "inventory_status_timeout",
          504
        );
      }

      throw error;
    } finally {
      timedRequest?.cleanup();
    }

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok) {
      const error = new Error(payload?.message || "Não foi possível atualizar o estoque agora.");
      error.code = payload?.code || "inventory_status_failed";
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  })();

  try {
    return await request.promise;
  } finally {
    if (activeInventoryStatusRequest === request) {
      activeInventoryStatusRequest = null;
    }
  }
}

async function refreshCatalogAvailability({ notify = true, quiet = true, reason = "inventory_sync" } = {}) {
  try {
    const payload = await fetchInventoryStatus({});
    applyCatalogInventorySnapshot(payload, { notify, reason });
    return payload;
  } catch (error) {
    logCheckoutWarn("Falha ao sincronizar estoque do cardápio.", error);
    if (!quiet) {
      showToast("Não foi possível atualizar o estoque agora.");
    }
    return null;
  }
}

async function syncInventoryAfterOrderError(error) {
  const errorCode = normalizeText(error?.code);
  if (!["product_unavailable", "invalid_combo_option", "unknown_product"].includes(errorCode)) {
    return;
  }

  await refreshCatalogAvailability({
    notify: true,
    quiet: true,
    reason: "order_validation_failed"
  });
}

async function fetchPreparedOrderTicket(token, { signal } = {}) {
  const url = new URL(resolveOrderTicketApiUrl(), window.location.origin);
  url.searchParams.set("token", token);
  const timedRequest = signal ? null : createTimedRequest(DELIVERY_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(url.toString(), {
      signal: signal || timedRequest?.controller.signal,
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (timedRequest?.didTimeout && isAbortError(error)) {
      throw createDeliveryRequestError(
        "A comanda segura demorou mais do que o esperado para carregar.",
        "order_ticket_fetch_timeout",
        504
      );
    }

    throw error;
  } finally {
    timedRequest?.cleanup();
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.ok || !data?.order) {
    const error = new Error(data?.message || "Não foi possível abrir a comanda agora.");
    error.code = data?.code || "order_ticket_fetch_failed";
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data.order;
}

async function fetchDeliveryAreas({ signal } = {}) {
  const timedRequest = signal ? null : createTimedRequest(DELIVERY_AREAS_REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(resolveDeliveryAreasApiUrl(), {
      signal: signal || timedRequest?.controller.signal,
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (timedRequest?.didTimeout && isAbortError(error)) {
      throw createDeliveryRequestError(
        "A lista de bairros demorou mais do que o esperado para carregar.",
        "delivery_areas_timeout",
        504
      );
    }

    throw error;
  } finally {
    timedRequest?.cleanup();
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !Array.isArray(payload?.areas)) {
    const error = new Error(payload?.message || "Nao foi possivel carregar os bairros de entrega agora.");
    error.code = payload?.code || "delivery_areas_failed";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function fetchStoreStatus({ signal } = {}) {
  const timedRequest = signal ? null : createTimedRequest(STORE_STATUS_REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(STORE_STATUS_API_URL, {
      signal: signal || timedRequest?.controller.signal,
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (timedRequest?.didTimeout && isAbortError(error)) {
      throw createDeliveryRequestError(
        "O status da loja demorou mais do que o esperado para carregar.",
        "store_status_timeout",
        504
      );
    }

    throw error;
  } finally {
    timedRequest?.cleanup();
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.message || "Nao foi possivel carregar o status da loja agora.");
    error.code = payload?.code || "store_status_failed";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function refreshStoreStatus({ quiet = true, reason = "manual" } = {}) {
  if (activeStoreStatusRequest?.promise) {
    return activeStoreStatusRequest.promise;
  }

  const request = {};
  activeStoreStatusRequest = request;
  request.promise = (async () => {
    try {
      const payload = await fetchStoreStatus({});

      storeStatusState = createStoreStatusState({
        loaded: true,
        loading: false,
        updatedAt: payload.updatedAt,
        error: "",
        overrideMode: payload.overrideMode,
        persistenceConfigured: payload.persistenceConfigured !== false
      });

      updateStoreStatusUI();
      return storeStatusState;
    } catch (error) {
      storeStatusState = createStoreStatusState({
        loaded: true,
        loading: false,
        updatedAt: storeStatusState.updatedAt,
        error: error.message,
        overrideMode: storeStatusState.overrideMode,
        persistenceConfigured: storeStatusState.persistenceConfigured
      });

      if (!quiet) {
        showToast(error.message || "Nao foi possivel carregar o status da loja agora.");
      }

      logCheckoutWarn("Falha ao carregar o status operacional da loja.", {
        reason,
        error
      });
      return null;
    } finally {
      if (activeStoreStatusRequest === request) {
        activeStoreStatusRequest = null;
      }
    }
  })();

  return request.promise;
}

function handleStoreStatusRealtimeRefresh(reason = "store_status_sync") {
  refreshStoreStatus({
    quiet: true,
    reason
  }).catch(error => {
    logCheckoutWarn("Falha ao sincronizar o status da loja em segundo plano.", error);
  });
}

async function refreshDeliveryAreas({ quiet = true, reason = "manual" } = {}) {
  if (activeDeliveryAreasRequest?.promise) {
    return activeDeliveryAreasRequest.promise;
  }

  const request = {};
  activeDeliveryAreasRequest = request;
  request.promise = (async () => {
    try {
      const payload = await fetchDeliveryAreas({});
      const zones = Array.isArray(payload.zones)
        ? payload.zones.map(sanitizeDeliveryZoneOption).filter(Boolean)
        : [];
      const areas = payload.areas
        .map(sanitizeDeliveryAreaOption)
        .filter(Boolean)
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

      deliveryAreasState = createDeliveryAreasState({
        loaded: true,
        loading: false,
        updatedAt: payload.updatedAt,
        error: "",
        zones,
        areas
      });

      renderDeliveryAreaOptions();

      const selectedArea = getSelectedDeliveryArea();
      if (
        deliveryState.status === "ready"
        && selectedArea
        && (
          selectedArea.status !== "active"
          || selectedArea.id !== deliveryState.deliveryAreaId
          || Math.abs(Number(selectedArea.fee || 0) - Number(deliveryState.fee || 0)) > 0.0001
        )
      ) {
        clearDeliveryQuote("As regras de entrega deste bairro mudaram. Valide a taxa novamente.");
      }

      return deliveryAreasState;
    } catch (error) {
      deliveryAreasState = createDeliveryAreasState({
        loaded: true,
        loading: false,
        updatedAt: deliveryAreasState.updatedAt,
        error: error.message,
        zones: deliveryAreasState.zones,
        areas: deliveryAreasState.areas
      });

      if (!quiet) {
        showToast(error.message || "Nao foi possivel carregar os bairros de entrega agora.");
      }

      if (!deliveryAreasState.areas.length) {
        renderDeliveryAreaOptions();
      }

      logCheckoutWarn("Falha ao carregar a lista de bairros de entrega.", {
        reason,
        error
      });
      return null;
    } finally {
      if (activeDeliveryAreasRequest === request) {
        activeDeliveryAreasRequest = null;
      }
    }
  })();

  return request.promise;
}

function handleDeliveryAreasRealtimeRefresh(reason = "delivery_areas_sync") {
  refreshDeliveryAreas({
    quiet: true,
    reason
  }).catch(error => {
    logCheckoutWarn("Falha ao sincronizar bairros de entrega em segundo plano.", error);
  });
}

async function requestDeliveryQuote({ showMessage = true, quietSuccess = false, reason = "manual" } = {}) {
  clearScheduledAutoDeliveryQuote();

  if (getCurrentFulfillmentMode() === "pickup") {
    return deliveryState;
  }

  if (!deliveryAreasState.loaded) {
    refreshDeliveryAreas({ quiet: true, reason: `${reason}_bootstrap` }).catch(error => {
      logCheckoutWarn("Falha ao sincronizar bairros em segundo plano antes da cotacao.", error);
    });
  }

  if (!validateAddressFields(showMessage)) {
    return null;
  }

  const fields = getDeliveryFields();
  const values = getDeliveryValues();
  const requestKey = buildDeliveryAddressKey(values);

  if (
    deliveryState.status === "ready"
    && deliveryState.addressKey === requestKey
    && isDeliveryQuoteFresh(deliveryState)
  ) {
    return deliveryState;
  }

  if (activeDeliveryQuoteRequest?.key === requestKey) {
    return activeDeliveryQuoteRequest.promise;
  }

  cancelActiveDeliveryQuoteRequest("superseded");

  const request = createTimedRequest(DELIVERY_REQUEST_TIMEOUT_MS);
  request.key = requestKey;
  activeDeliveryQuoteRequest = request;

  setDeliveryState(createDeliveryState({
    status: "loading",
    address: syncDeliveryAddressField(),
    message: reason === "finalize"
      ? "Calculando taxa de entrega..."
      : "Calculando taxa de entrega...",
  }));

  request.promise = (async () => {
    try {
      const payload = await fetchDeliveryQuote(values, {
        signal: request.controller.signal
      });
      const normalizedPayload = normalizeDeliveryQuotePayload(payload, values);

      if (
        activeDeliveryQuoteRequest !== request
        || getCurrentFulfillmentMode() === "pickup"
        || buildDeliveryAddressKey(getDeliveryValues()) !== requestKey
      ) {
        return null;
      }

      applyValidatedAddressToFields(normalizedPayload.validatedAddress);
      syncDeliveryAddressField();

      if (fields.distanceRange) {
        fields.distanceRange.value = payload.zone || "";
      }

      if (fields.estimateAck) {
        fields.estimateAck.checked = !normalizedPayload.isDeliveryUnavailable;
        clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
      }

      const nextState = createDeliveryState({
        status: normalizedPayload.status,
        fee: normalizedPayload.fee,
        distanceLabel: payload.distanceLabel || DELIVERY_ZONE_LABELS[payload.zone] || "",
        distanceRange: payload.zone || "",
        address: syncDeliveryAddressField(),
        message: payload.message || DELIVERY_IDLE_MESSAGE,
        quoteCode: normalizedPayload.isDeliveryUnavailable ? "" : payload.quote?.code || "",
        quoteToken: normalizedPayload.isDeliveryUnavailable ? "" : payload.quote?.token || "",
        addressKey: buildDeliveryAddressKey(normalizedPayload.validatedAddress),
        expiresAt: normalizedPayload.isDeliveryUnavailable ? "" : payload.quote?.expiresAt || "",
        distanceKm: normalizedPayload.distanceKm,
        routeDistanceKm: normalizedPayload.routeDistanceKm,
        locationPrecision: normalizeText(payload.locationPrecision),
        geocoderSource: normalizeText(payload.geocoderSource),
        deliveryAreaId: normalizedPayload.deliveryArea.id,
        deliveryAreaName: normalizedPayload.deliveryArea.name,
        deliveryAreaStatus: normalizedPayload.deliveryArea.status,
        deliveryAreaNote: normalizedPayload.deliveryArea.note,
        validatedAddress: normalizedPayload.validatedAddress
      });

      setDeliveryState(nextState);
      updateCartTotals();

      if (!quietSuccess && showMessage) {
        showToast(payload.message || "Endere\u00e7o validado com sucesso.");
      }

      return nextState;
    } catch (error) {
      const payload = error.payload || {};
      const wasCancelled = isAbortError(error) && !request.didTimeout;

      if (
        activeDeliveryQuoteRequest !== request
        || wasCancelled
        || getCurrentFulfillmentMode() === "pickup"
        || buildDeliveryAddressKey(getDeliveryValues()) !== requestKey
      ) {
        return null;
      }

      const message = request.didTimeout
        ? "A valida\u00e7\u00e3o da entrega demorou mais do que o esperado. Confira sua conex\u00e3o e tente novamente."
        : payload.message
          || (error.code === "missing_address_field" ? DELIVERY_IDLE_MESSAGE : "")
          || (!/^https?:\/\//i.test(String(window?.location?.href || "").trim())
            ? "Este teste local precisa do deploy da Vercel ou de um servidor com a API /api/delivery-quote ativa."
            : "")
          || (error.name === "TypeError" ? "N\u00e3o foi poss\u00edvel validar a entrega agora." : error.message)
          || "N\u00e3o foi poss\u00edvel validar a entrega agora.";

      if (payload.officialAddress) {
        applyValidatedAddressToFields(payload.officialAddress);
        syncDeliveryAddressField();
      }

      if (fields.estimateAck) {
        fields.estimateAck.checked = false;
        clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
      }

      setDeliveryState(createDeliveryState({
        status: payload.status === "out_of_range" ? "out_of_range" : "error",
        address: syncDeliveryAddressField(),
        message,
      }));
      updateCartTotals();

      if (showMessage) {
        showToast(message);
      }

      return null;
    } finally {
      if (activeDeliveryQuoteRequest === request) {
        activeDeliveryQuoteRequest = null;
      }

      request.cleanup();
    }
  })();

  return request.promise;
}

function validateDeliveryEstimateAcceptance(showMessage = true) {
  const fields = getDeliveryFields();

  clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);

  if (getCurrentFulfillmentMode() === "pickup" || fields.estimateAck?.checked) {
    return true;
  }

  if (showMessage) {
    setEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
    fields.estimateAck?.focus();
    logCheckoutWarn("Checkout bloqueado: aceite da taxa validada n\u00e3o confirmado.");
    showToast("Confirme que entendeu a taxa validada antes de enviar o pedido.");
  }

  return false;
}

async function fetchViaCepData(cep, { signal } = {}) {
  const cleanCep = normalizeCep(cep);

  if (viaCepCache.has(cleanCep)) {
    return viaCepCache.get(cleanCep);
  }

  const response = await fetch(`${VIA_CEP_BASE_URL}/${cleanCep}/json/`, {
    signal
  });

  if (!response.ok) {
    throw new Error("via_cep_failed");
  }

  const data = await response.json();

  if (data.erro) {
    throw new Error("cep_not_found");
  }

  viaCepCache.set(cleanCep, data);
  return data;
}

async function lookupCep(isManual = false) {
  const fields = getDeliveryFields();
  const cep = normalizeCep(fields.cep?.value);

  if (!fields.cep) return;

  fields.cep.value = formatCep(cep);
  cancelActiveViaCepLookup("superseded");

  if (cep.length !== 8) {
    clearDeliveryQuote("Digite um CEP v\u00e1lido com 8 n\u00fameros.");

    if (isManual) showToast("Digite um CEP v\u00e1lido com 8 n\u00fameros.");
    return;
  }

  const request = createTimedRequest(VIA_CEP_REQUEST_TIMEOUT_MS);
  request.cep = cep;
  activeViaCepLookup = request;

  if (fields.searchCepButton) {
    fields.searchCepButton.disabled = true;
    fields.searchCepButton.textContent = "Buscando...";
  }

  try {
    const data = await fetchViaCepData(cep, {
      signal: request.controller.signal
    });

    if (
      activeViaCepLookup !== request
      || normalizeCep(fields.cep?.value) !== cep
    ) {
      return;
    }

    if (fields.street) fields.street.value = data.logradouro || "";
    if (fields.neighborhood) {
      syncDeliveryAreaSelection("", data.bairro || "");
    }
    if (fields.city) fields.city.value = data.localidade || "";
    if (fields.state) fields.state.value = data.uf || "";

    syncDeliveryAddressField();
    clearDeliveryQuote("CEP localizado. Revise o endere\u00e7o e valide a entrega.");
    scheduleAutoDeliveryQuote("cep_lookup");

    saveDeliveryData();
  } catch (error) {
    const wasCancelled = isAbortError(error) && !request.didTimeout;

    if (
      activeViaCepLookup !== request
      || wasCancelled
      || normalizeCep(fields.cep?.value) !== cep
    ) {
      return;
    }

    if (fields.neighborhood) {
      fields.neighborhood.value = "";
      fields.neighborhood.dataset.savedAreaId = "";
      fields.neighborhood.dataset.savedAreaName = "";
    }
    if (fields.city) fields.city.value = "";
    if (fields.state) fields.state.value = "";
    syncNeighborhoodHelperFromSelection();

    setDeliveryState(createDeliveryState({
      status: "error",
      address: syncDeliveryAddressField(),
      message: request.didTimeout
        ? "A busca do CEP demorou mais do que o esperado. Tente novamente."
        : error.message === "cep_not_found"
          ? "CEP n\u00e3o encontrado."
          : "Nao foi possivel buscar o CEP agora. Voce ainda pode tentar calcular a entrega."
    }));

    showToast(deliveryState.message);
  } finally {
    if (activeViaCepLookup === request) {
      activeViaCepLookup = null;
    }

    request.cleanup();

    if (fields.searchCepButton) {
      fields.searchCepButton.disabled = false;
      fields.searchCepButton.textContent = "Buscar CEP";
    }
  }
}

async function handleCalculateDelivery() {
  clearScheduledAutoDeliveryQuote();

  if (getCurrentFulfillmentMode() === "pickup") {
    setDeliveryState(createDeliveryState({
      status: "pickup",
      address: STORE_ADDRESS,
      message: "Retirada no balc\u00e3o, sem taxa de entrega.",
    }));
    updateCartTotals();
    return;
  }

  await requestDeliveryQuote({ showMessage: true, quietSuccess: false, reason: "manual" });
}

function setDeliveryState(nextState) {
  deliveryState = createDeliveryState(nextState);

  updateDeliveryUI();
  saveDeliveryData();
}

function updateDeliveryUI() {
  const fields = getDeliveryFields();
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasAcceptedEstimate = Boolean(fields.estimateAck?.checked);
  let feedbackMessage = deliveryState.message || "";
  let feedbackTone = deliveryState.status;

  if (!isPickup && deliveryState.status === "ready" && !hasAcceptedEstimate) {
    feedbackMessage = "Taxa validada. Confirme o aceite abaixo para liberar o envio do pedido para a hamburgueria.";
    feedbackTone = "warning";
  }

  if (fields.feeFeedback) {
    fields.feeFeedback.classList.remove("fee-ok", "fee-warning", "fee-error");
    fields.feeFeedback.textContent = feedbackMessage;
  }

  if (fields.calculateDeliveryButton) {
    fields.calculateDeliveryButton.disabled = deliveryState.status === "loading";
    fields.calculateDeliveryButton.textContent =
      deliveryState.status === "loading"
        ? "Calculando taxa de entrega..."
        : deliveryState.status === "ready"
          ? "Taxa calculada"
          : deliveryState.status === "pickup_only"
            ? "Somente retirada"
          : deliveryState.status === "blocked"
            ? "Entrega bloqueada"
          : deliveryState.status === "out_of_range"
            ? "Entrega indispon\u00edvel"
          : "Calcular taxa de entrega";

    fields.calculateDeliveryButton.classList.toggle("is-success", deliveryState.status === "ready");
  }

  if (fields.quoteSummary) {
    if (isPickup) {
      fields.quoteSummary.textContent = "Retirada no balc\u00e3o, sem taxa de entrega.";
    } else if (deliveryState.status === "ready") {
      fields.quoteSummary.textContent = deliveryState.message || "Entrega dispon\u00edvel para sua regi\u00e3o.";
    } else if (deliveryState.status === "pickup_only") {
      fields.quoteSummary.textContent = deliveryState.message || "Para essa regi\u00e3o, no momento trabalhamos apenas com retirada no local.";
    } else if (deliveryState.status === "blocked") {
      fields.quoteSummary.textContent = deliveryState.message || "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local.";
    } else if (deliveryState.status === "out_of_range") {
      fields.quoteSummary.textContent = deliveryState.message || "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local.";
    } else if (deliveryState.status === "loading") {
      fields.quoteSummary.textContent = "Calculando taxa de entrega...";
    } else {
      fields.quoteSummary.textContent = DELIVERY_IDLE_MESSAGE;
    }
  }

  if (fields.feeLine) {
    if (isPickup) {
      fields.feeLine.textContent = "Taxa de entrega: R$ 0,00";
    } else if (deliveryState.status === "ready") {
      fields.feeLine.textContent = `Taxa de entrega: ${formatCurrency(deliveryState.fee)}`;
    } else if (deliveryState.status === "pickup_only" || deliveryState.status === "blocked") {
      fields.feeLine.textContent = "Taxa de entrega: retirada obrigatoria";
    } else if (deliveryState.status === "out_of_range") {
      fields.feeLine.textContent = "Taxa de entrega: indispon\u00edvel";
    } else if (deliveryState.status === "loading") {
      fields.feeLine.textContent = "Taxa de entrega: calculando...";
    } else {
      fields.feeLine.textContent = "Taxa de entrega: aguardando c\u00e1lculo";
    }
  }

  if (fields.totalNote) {
    if (isPickup) {
      fields.totalNote.textContent = "Total final para retirada no local";
    } else if (deliveryState.status === "ready") {
      fields.totalNote.textContent = "Taxa confirmada para este endere\u00e7o. Se o local mudar, a entrega ser\u00e1 recalculada.";
    } else if (deliveryState.status === "pickup_only" || deliveryState.status === "blocked") {
      fields.totalNote.textContent = deliveryState.message || "Para esse bairro, o atendimento segue apenas com retirada.";
    } else if (deliveryState.status === "out_of_range") {
      fields.totalNote.textContent = deliveryState.message || "No momento n\u00e3o entregamos para essa regi\u00e3o.";
    } else if (deliveryState.status === "loading") {
      fields.totalNote.textContent = "Calculando taxa de entrega...";
    } else {
      fields.totalNote.textContent = "Valide a entrega para atualizar o total";
    }
  }

  if (fields.totalLabel) {
    if (isPickup) {
      fields.totalLabel.textContent = "Total do pedido";
    } else if (["out_of_range", "blocked", "pickup_only"].includes(deliveryState.status)) {
      fields.totalLabel.textContent = "Subtotal do pedido";
    } else {
      fields.totalLabel.textContent = "Total do pedido com entrega";
    }
  }

  if (fields.feeFeedback) {
    if (feedbackTone === "ready") fields.feeFeedback.classList.add("fee-ok");
    if (["out_of_range", "blocked", "pickup_only", "warning"].includes(feedbackTone)) fields.feeFeedback.classList.add("fee-warning");
    if (feedbackTone === "error") fields.feeFeedback.classList.add("fee-error");
  }
}

function saveDeliveryData() {
  const values = getDeliveryValues();

  localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify({
    ...values,
    address: syncDeliveryAddressField(),
    deliveryState
  }));
}

function loadDeliveryData() {
  const raw = localStorage.getItem(DELIVERY_STORAGE_KEY);
  const fields = getDeliveryFields();

  if (fields.city && !normalizeText(fields.city.value)) {
    fields.city.value = CONFIGURED_SERVICE_AREA.city;
  }
  if (fields.state && !normalizeText(fields.state.value)) {
    fields.state.value = CONFIGURED_SERVICE_AREA.state;
  }

  if (!raw) {
    syncDeliveryAddressField();
    return;
  }

  try {
    const saved = JSON.parse(raw);

    if (fields.cep) fields.cep.value = formatCep(saved.cep || "");
    if (fields.street) fields.street.value = saved.street || "";
    if (fields.number) fields.number.value = saved.number || "";
    if (fields.neighborhood) {
      fields.neighborhood.dataset.savedAreaId = saved.deliveryAreaId || "";
      fields.neighborhood.dataset.savedAreaName = saved.neighborhood || "";
    }
    if (fields.complement) fields.complement.value = saved.complement || "";
    if (fields.reference) fields.reference.value = saved.reference || "";
    if (fields.city) fields.city.value = saved.city || CONFIGURED_SERVICE_AREA.city;
    if (fields.state) fields.state.value = saved.state || CONFIGURED_SERVICE_AREA.state;
    if (fields.distanceRange) fields.distanceRange.value = saved.distanceRange || "";
    if (fields.estimateAck) fields.estimateAck.checked = Boolean(saved.estimateAccepted);

    syncDeliveryAddressField();
    renderDeliveryAreaOptions();

    if (saved.deliveryState) {
      deliveryState = createDeliveryState(saved.deliveryState);
    }

    const savedAddressKey = buildDeliveryAddressKey(saved);
    const hasMatchingSavedQuote = !deliveryState.addressKey || deliveryState.addressKey === savedAddressKey;

    if (!hasMatchingSavedQuote || !isDeliveryQuoteFresh(deliveryState)) {
      if (fields.estimateAck) fields.estimateAck.checked = false;
      deliveryState = createDeliveryState({
        address: syncDeliveryAddressField()
      });
    }

    updateDeliveryUI();
  } catch {
    localStorage.removeItem(DELIVERY_STORAGE_KEY);
  }
}

function clearDeliveryData() {
  localStorage.removeItem(DELIVERY_STORAGE_KEY);
  LEGACY_DELIVERY_STORAGE_KEYS.forEach(storageKey => {
    localStorage.removeItem(storageKey);
  });

  const fields = getDeliveryFields();
  if (fields.estimateAck) fields.estimateAck.checked = false;
  clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);

  clearScheduledAutoDeliveryQuote();
  cancelActiveDeliveryQuoteRequest("clear_storage");
  cancelActiveViaCepLookup("clear_storage");

  deliveryState = createDeliveryState();
}

function loadPendingCustomerOrder() {
  try {
    const raw = localStorage.getItem(ORDER_PREPARATION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    localStorage.removeItem(ORDER_PREPARATION_STORAGE_KEY);
    return null;
  }
}

function savePendingCustomerOrder(orderPreview) {
  pendingCustomerOrder = orderPreview && typeof orderPreview === "object"
    ? {
        ...orderPreview,
        pendingAt: new Date().toISOString()
      }
    : null;

  if (!pendingCustomerOrder) {
    localStorage.removeItem(ORDER_PREPARATION_STORAGE_KEY);
    updatePendingOrderBanner();
    return;
  }

  localStorage.setItem(ORDER_PREPARATION_STORAGE_KEY, JSON.stringify(pendingCustomerOrder));
  updatePendingOrderBanner();
}

function clearPendingCustomerOrder() {
  pendingCustomerOrder = null;
  localStorage.removeItem(ORDER_PREPARATION_STORAGE_KEY);
  updatePendingOrderBanner();
}

function invalidatePendingCustomerOrder(reason = "") {
  if (!pendingCustomerOrder) {
    return;
  }

  logCheckoutInfo("Pedido pendente descartado porque o checkout mudou.", {
    reason,
    orderCode: pendingCustomerOrder.orderCode || ""
  });
  clearPendingCustomerOrder();
}

function updatePendingOrderBanner() {
  const banner = document.getElementById("pending-order-banner");
  const title = document.getElementById("pending-order-title");
  const copy = document.getElementById("pending-order-copy");

  if (!banner) return;

  const expiresAt = Number(new Date(pendingCustomerOrder?.expiresAt || "").getTime());
  if (pendingCustomerOrder && Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
    pendingCustomerOrder = null;
    localStorage.removeItem(ORDER_PREPARATION_STORAGE_KEY);
  }

  if (!pendingCustomerOrder?.whatsAppMessage) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;

  if (title) {
    title.textContent = pendingCustomerOrder.orderCode
      ? `Pedido pendente ${pendingCustomerOrder.orderCode}`
      : "Pedido aguardando envio";
  }

  if (copy) {
    copy.textContent = pendingCustomerOrder.totalLabel
      ? `Seu pedido ficou salvo neste navegador. Se ainda não terminou no WhatsApp, você pode abrir novamente ou marcar como enviado quando concluir. Total: ${pendingCustomerOrder.totalLabel}.`
      : "Seu pedido ficou salvo neste navegador até a confirmação do envio.";
  }
}

function markPendingOrderSent() {
  if (!pendingCustomerOrder) {
    return;
  }

  cart = [];
  saveCart();
  clearDeliveryData();
  clearPendingCustomerOrder();
  pendingOrderPreview = null;
  closeOrderTicketModal({ restoreCart: false });
  closeCartModal();
  updateUI();
  showToast("Pedido marcado como enviado. Carrinho liberado para o próximo atendimento.");
}

function reopenPendingOrderWhatsApp() {
  if (!pendingCustomerOrder?.whatsAppMessage) {
    showToast("Não existe pedido pendente para reenviar.");
    return;
  }

  try {
    openWhatsAppOrder(pendingCustomerOrder.whatsAppMessage, { source: "pending_order" });
  } catch (error) {
    logCheckoutError("Falha ao reabrir o WhatsApp do pedido pendente.", error);
    showToast("Não foi possível abrir o WhatsApp agora. Tente novamente.");
  }
}

function getCartTotal() {
  return cart.reduce((sum, item) => {
    const price = normalizeMoneyValue(item?.price, 0);
    const quantity = Math.max(0, Math.round(normalizeMoneyValue(item?.quantity, 0)));
    return sum + (price * quantity);
  }, 0);
}

function hasReachedMinimumOrder(subtotal = getCartTotal()) {
  return subtotal >= MIN_ORDER_AMOUNT;
}

function getMinimumOrderShortfall(subtotal = getCartTotal()) {
  return Math.max(0, MIN_ORDER_AMOUNT - subtotal);
}

function updateMinimumOrderNote(subtotal = getCartTotal()) {
  const note = document.getElementById("minimum-order-note");
  if (!note) return;

  if (!cart.length) {
    note.dataset.status = "idle";
    note.textContent = `Pedido m\u00ednimo da Galaxy Burger: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;
    return;
  }

  if (hasReachedMinimumOrder(subtotal)) {
    note.dataset.status = "ready";
    note.textContent = `Pedido m\u00ednimo atingido. Subtotal dos produtos: ${formatCurrency(subtotal)}.`;
    return;
  }

  note.dataset.status = "warning";
  note.textContent = `Pedido m\u00ednimo de ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para liberar o envio.`;
}

function updatePixPanelSummary({ subtotal = getCartTotal(), total = subtotal } = {}) {
  const totalDisplay = document.getElementById("pix-total-display");
  const totalCaption = document.getElementById("pix-total-caption");
  const proofNote = document.getElementById("pix-proof-note");
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasItems = cart.length > 0;
  const meetsMinimumOrder = hasReachedMinimumOrder(subtotal);

  if (totalDisplay) {
    totalDisplay.textContent = formatCurrency(total);
  }

  if (totalCaption) {
    if (!hasItems) {
      totalCaption.textContent = "O valor final do Pix aparece aqui assim que voc\u00ea adicionar itens ao pedido.";
    } else if (!meetsMinimumOrder) {
      totalCaption.textContent = `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o pedido.`;
    } else if (!isPickup && !(deliveryState.status === "ready" && deliveryState.quoteToken)) {
      totalCaption.textContent = "Valide o endere\u00e7o e a taxa de entrega para fechar o valor final do Pix.";
    } else if (isPickup) {
      totalCaption.textContent = "Pague o valor exato da retirada para agilizar a confer\u00eancia da loja.";
    } else {
      totalCaption.textContent = "Pague o valor exato exibido aqui para acelerar a confer\u00eancia do pagamento.";
    }
  }

  if (proofNote) {
    proofNote.textContent = hasItems
      ? "A Galaxy Burger confere o comprovante antes de preparar o pedido. Envie o comprovante na mesma conversa do pedido no WhatsApp oficial."
      : "A Galaxy Burger confere o comprovante antes de preparar o pedido. Assim que voc\u00ea montar o carrinho, o valor final do Pix aparecer\u00e1 aqui.";
  }
}

function getFinalizeButtonLabel() {
  return getCurrentFulfillmentMode() === "pickup"
    ? "Revisar retirada no WhatsApp"
    : "Revisar pedido no WhatsApp";
}

function getFinalizeButton() {
  return document.getElementById("finalize-order-btn") || document.querySelector(".finalize-order-btn");
}

function isFinalizeButtonBusy(button = getFinalizeButton()) {
  return button?.dataset.busy === "true";
}

function setFinalizeButtonBusy(isBusy, label = "Abrindo WhatsApp...") {
  const finalizeButton = getFinalizeButton();
  if (!finalizeButton) return;

  finalizeButton.dataset.busy = isBusy ? "true" : "false";
  finalizeButton.disabled = Boolean(isBusy);

  if (isBusy) {
    finalizeButton.textContent = label;
  }
}

function setOrderTicketConfirmButtonBusy(isBusy, label = "Abrindo WhatsApp...") {
  const confirmButton = document.getElementById("order-ticket-confirm-button");
  if (!confirmButton) return;

  if (!confirmButton.dataset.defaultLabel) {
    confirmButton.dataset.defaultLabel = confirmButton.textContent.trim() || "Abrir WhatsApp";
  }

  confirmButton.dataset.busy = isBusy ? "true" : "false";
  confirmButton.disabled = Boolean(isBusy);
  confirmButton.textContent = isBusy ? label : confirmButton.dataset.defaultLabel;
}

function resetOrderSubmissionButtons() {
  setFinalizeButtonBusy(false);
  setOrderTicketConfirmButtonBusy(false);
  updateCartTotals();
}

function syncCatalogCards() {
  document.querySelectorAll(".card[data-product-id]").forEach(card => {
    const product = getCatalogProduct(card.dataset.productId);
    const price = card.querySelector(".price");
    const button = card.querySelector(".add-btn");
    const sellable = isCatalogProductSellable(product);

    if (price && product) {
      price.textContent = formatCurrency(product.price);
    }

    if (product?.category === "combo" && product?.combo?.drinksCount) {
      card.dataset.comboDrinks = String(product.combo.drinksCount);
    }

    card.classList.toggle("is-unavailable", !sellable);

    if (!button) {
      return;
    }

    if (!button.dataset.label) {
      const currentLabel = button.textContent.trim();
      button.dataset.label = currentLabel && currentLabel !== "Esgotado"
        ? currentLabel
        : product?.category === "combo"
          ? "Quero esse combo"
          : product?.category === "drink"
            ? "Adicionar bebida"
            : product?.category === "extra"
              ? "Adicionar ao pedido"
              : product?.category === "side"
                ? "Quero essa porção"
                : "Quero esse burger";
    }

    button.disabled = !sellable;
    button.textContent = sellable ? button.dataset.label : "Esgotado";
  });
}

function updateCartTotals() {
  const subtotal = getCartTotal();
  const subtotalEl = document.getElementById("modal-cart-subtotal");
  const totalEl = document.getElementById("modal-cart-total");
  const finalizeButton = getFinalizeButton();
  const storeOpen = getStoreAvailability().isOpen;

  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const hasItems = cart.length > 0;
  const meetsMinimumOrder = hasReachedMinimumOrder(subtotal);
  const hasAcceptedEstimate = Boolean(getDeliveryFields().estimateAck?.checked);
  const hasValidatedDelivery = !isPickup && deliveryState.status === "ready" && Boolean(deliveryState.quoteToken);
  const deliveryUnavailable = !isPickup && ["out_of_range", "blocked", "pickup_only"].includes(deliveryState.status);
  const fee = hasItems && hasValidatedDelivery
    ? Math.max(0, normalizeMoneyValue(deliveryState.fee))
    : 0;

  const total = hasItems ? subtotal + fee : 0;

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
  updateMinimumOrderNote(subtotal);
  updatePixPanelSummary({ subtotal, total });

  if (finalizeButton) {
    const busy = isFinalizeButtonBusy(finalizeButton);
    const isCalculatingDelivery = !isPickup && deliveryState.status === "loading";

    finalizeButton.disabled = busy || isCalculatingDelivery;

    if (!busy) {
      finalizeButton.textContent = !storeOpen
        ? "Loja fechada no momento"
        : isCalculatingDelivery
          ? "Calculando taxa de entrega..."
        : hasItems && !meetsMinimumOrder
          ? `Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para o m\u00ednimo`
          : !hasItems
            ? getFinalizeButtonLabel()
            : deliveryUnavailable
              ? "Escolha retirada para continuar"
            : !isPickup && !hasValidatedDelivery
              ? "Valide o endere\u00e7o para enviar"
              : !isPickup && !hasAcceptedEstimate
                ? "Confirme a entrega para enviar"
                : getFinalizeButtonLabel();
    }
  }

  return {
    subtotal,
    fee,
    total
  };
}

function saveCart() {
  cart = cart
    .map(sanitizeCartItem)
    .filter(Boolean);
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateUI() {
  syncCatalogCards();
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  ["header-cart-count", "mobile-cart-count", "mobile-dock-cart-count"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = totalItems;
  });

  updateModalCart();
  updateOrderAvailabilityUI(getStoreAvailability());
}

function updateModalCart() {
  const container = document.getElementById("modal-cart-items");
  if (!container) return;

  container.innerHTML = "";

  if (!cart.length) {
    container.innerHTML = `<p class="empty-cart">Seu pedido est\u00e1 vazio.</p>`;
    updateCartTotals();
    return;
  }

  cart.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "cart-item";
    const isSellable = isCartItemSellable(item);

    div.innerHTML = `
      <div class="item-info">
        <strong>${item.name}</strong>
        ${item.variantLabel ? `<small>${item.variantLabel}</small>` : ""}
        ${!isSellable ? `<small>Item indisponível no momento. Remova para continuar.</small>` : ""}
        <span>${formatCurrency(item.price)} por unidade</span>
      </div>

      <div class="item-controls">
        <button type="button" onclick="changeItemQuantity(${index}, -1)">-</button>
        <span>${item.quantity}</span>
        <button type="button" onclick="changeItemQuantity(${index}, 1)">+</button>
      </div>

      <button type="button" class="remove-btn" onclick="removeItem(${index})">Remover</button>
    `;

    container.appendChild(div);
  });

  updateCartTotals();
}

function getUnavailableCartItems() {
  return cart.filter(item => !isCartItemSellable(item));
}

function buildCartItemKey({ productId = "", selectedOptionIds = [], variantLabel = "" } = {}) {
  return [
    normalizeText(productId),
    [...selectedOptionIds].map(optionId => normalizeText(optionId)).filter(Boolean).sort().join(","),
    normalizeText(variantLabel)
  ].join("|");
}

function addItemToCart({ productId, name, price, quantity = 1, variantLabel = "", selectedOptionIds = [] }) {
  invalidatePendingCustomerOrder("cart_item_added");
  const normalizedVariantLabel = normalizeText(variantLabel);
  const normalizedProductId = normalizeText(productId);
  const normalizedSelectedOptionIds = selectedOptionIds
    .map(optionId => normalizeText(optionId))
    .filter(Boolean);
  const nextItemKey = buildCartItemKey({
    productId: normalizedProductId,
    selectedOptionIds: normalizedSelectedOptionIds,
    variantLabel: normalizedVariantLabel
  });
  const existing = cart.find(item => buildCartItemKey(item) === nextItemKey);

  if (existing) {
    existing.quantity += quantity;
    return;
  }

  cart.push({
    productId: normalizedProductId,
    name,
    price,
    quantity,
    ...(normalizedSelectedOptionIds.length ? { selectedOptionIds: normalizedSelectedOptionIds } : {}),
    ...(normalizedVariantLabel ? { variantLabel: normalizedVariantLabel } : {})
  });
}

function showAddedButtonState(button, temporaryLabel = "Adicionado") {
  if (!button) return;

  const original = button.textContent;
  button.textContent = temporaryLabel;
  button.disabled = true;

  setTimeout(() => {
    const card = button.closest(".card");
    const product = getCatalogProduct(card?.dataset?.productId);
    const sellable = isCatalogProductSellable(product);
    button.textContent = sellable ? (button.dataset.label || original) : "Esgotado";
    button.disabled = !sellable;
  }, 900);
}

function getComboDrinkOptions(product) {
  return getCatalogComboOptionProducts(product).map(option => ({
    id: option.id,
    name: option.name
  }));
}

function buildComboVariantLabel(selectedDrinks) {
  const drinks = selectedDrinks.map(drink => normalizeText(drink?.name || drink)).filter(Boolean);
  if (!drinks.length) return "";

  return `${drinks.length === 1 ? "Bebida" : "Bebidas"}: ${drinks.join(", ")}`;
}

function getComboDrinkModalElements() {
  return {
    modal: document.getElementById("combo-drink-modal"),
    title: document.getElementById("combo-drink-modal-title"),
    copy: document.getElementById("combo-drink-modal-copy"),
    fields: document.getElementById("combo-drink-fields")
  };
}

function syncBodyModalState() {
  const hasVisibleModal = ["cart-modal", "combo-drink-modal", "order-ticket-modal"].some(id => {
    const modal = document.getElementById(id);
    return modal && !modal.hidden;
  });

  document.body.classList.toggle("modal-open", hasVisibleModal);
}

function closeComboDrinkModal() {
  const { modal, fields } = getComboDrinkModalElements();
  if (!modal) return;

  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    if (fields) fields.innerHTML = "";
    syncBodyModalState();
  }, 220);

  activeComboSelection = null;
}

function openComboDrinkModal(config) {
  const { modal, title, copy, fields } = getComboDrinkModalElements();
  if (!modal || !fields) return;

  activeComboSelection = config;
  modal.hidden = false;
  document.body.classList.add("modal-open");

  if (title) {
    title.textContent = config.drinksCount > 1 ? "Escolha as bebidas" : "Escolha sua bebida";
  }

  if (copy) {
    copy.textContent = config.drinksCount > 1
      ? `Selecione as ${config.drinksCount} bebidas que acompanham o ${config.name}.`
      : `Selecione a bebida que acompanha o ${config.name}.`;
  }

  fields.innerHTML = "";

  for (let index = 0; index < config.drinksCount; index += 1) {
    const wrapper = document.createElement("div");
    wrapper.className = "combo-drink-field";

    const label = document.createElement("label");
    label.className = "field-label";
    label.htmlFor = `combo-drink-select-${index}`;
    label.textContent = config.drinksCount > 1 ? `Bebida ${index + 1}` : "Bebida do combo";

    const select = document.createElement("select");
    select.id = `combo-drink-select-${index}`;
    select.className = "combo-drink-select";
    select.innerHTML = '<option value="">Selecione uma bebida</option>';

    config.options.forEach(option => {
      const optionElement = document.createElement("option");
      optionElement.value = option.id;
      optionElement.textContent = option.name;
      select.appendChild(optionElement);
    });

    select.addEventListener("change", () => {
      select.classList.remove("is-invalid");
      select.removeAttribute("aria-invalid");
    });

    wrapper.append(label, select);
    fields.appendChild(wrapper);
  }

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
  });
}

function addConfiguredComboToCart(config, selectedDrinks) {
  const selectedOptionIds = selectedDrinks.map(drink => normalizeText(drink.id)).filter(Boolean);
  addItemToCart({
    productId: config.productId,
    name: config.name,
    price: config.price,
    quantity: 1,
    selectedOptionIds,
    variantLabel: buildComboVariantLabel(selectedDrinks)
  });

  saveCart();
  updateUI();
  showAddedButtonState(config.button, "Combo adicionado");

  const drinksLabel = selectedDrinks.length
    ? ` com ${selectedDrinks.map(drink => drink.name).join(", ")}`
    : "";
  showToast(`${config.name} adicionado${drinksLabel}.`);
}

function confirmComboDrinkSelection() {
  if (!activeComboSelection) return;

  const selects = Array.from(document.querySelectorAll(".combo-drink-select"));
  const selectedDrinks = [];
  let firstInvalidField = null;

  selects.forEach(select => {
    select.classList.remove("is-invalid");
    select.removeAttribute("aria-invalid");

    if (!select.value) {
      select.classList.add("is-invalid");
      select.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = select;
      return;
    }

    const option = activeComboSelection.options.find(item => item.id === select.value);
    if (option) {
      selectedDrinks.push(option);
    }
  });

  if (firstInvalidField) {
    firstInvalidField.focus();
    showToast(
      activeComboSelection.drinksCount > 1
        ? "Selecione todas as bebidas do combo."
        : "Selecione a bebida do combo."
    );
    return;
  }

  addConfiguredComboToCart(activeComboSelection, selectedDrinks);
  closeComboDrinkModal();
}

function addToCart(button) {
  const card = button.closest(".card");
  if (!card) return;

  const product = getCatalogProduct(card.dataset.productId);
  if (!product) {
    showToast("Este item não está configurado corretamente no cardápio.");
    return;
  }

  if (!isCatalogProductSellable(product)) {
    showToast("Este item está esgotado no momento.");
    return;
  }

  const name = normalizeText(product.name);
  const price = normalizeMoneyValue(product.price, NaN);

  if (!name || Number.isNaN(price)) return;

  if (product.category === "combo" && card.classList.contains("combo-card")) {
    const drinksCount = Number(product.combo?.drinksCount || 0);
    const drinkOptions = getComboDrinkOptions(product);

    if (drinksCount > 0) {
      if (drinksCount === 1 && drinkOptions.length === 1) {
        addConfiguredComboToCart({
          productId: product.id,
          name,
          price,
          drinksCount,
          options: drinkOptions,
          button
        }, drinkOptions);
        return;
      }

      openComboDrinkModal({
        productId: product.id,
        name,
        price,
        drinksCount,
        options: drinkOptions,
        button
      });
      return;
    }
  }

  addItemToCart({
    productId: product.id,
    name,
    price,
    quantity: 1
  });

  saveCart();
  updateUI();
  showAddedButtonState(button);
  showToast(`${name} adicionado ao pedido.`);
}

function removeItem(index) {
  invalidatePendingCustomerOrder("cart_item_removed");
  cart.splice(index, 1);
  saveCart();
  updateUI();
}

function changeItemQuantity(index, delta) {
  if (!cart[index]) return;
  invalidatePendingCustomerOrder("cart_item_quantity_changed");

  cart[index].quantity += delta;

  if (cart[index].quantity <= 0) {
    removeItem(index);
    return;
  }

  saveCart();
  updateUI();
}

function selectPayment(button) {
  invalidatePendingCustomerOrder("payment_changed");
  clearPaymentInvalid();
  document.querySelectorAll(".payment-btn").forEach(btn => btn.classList.remove("selected"));
  button.classList.add("selected");

  const paymentField = document.getElementById("payment-method");
  if (paymentField) paymentField.value = button.dataset.payment || "";

  const pixInfo = document.getElementById("pix-info");
  if (pixInfo) {
    pixInfo.hidden = button.dataset.payment !== "pix";
  }

  const cashPanel = document.getElementById("cash-change-panel");
  if (cashPanel) {
    cashPanel.hidden = button.dataset.payment !== "dinheiro";
  }

  updateCashChangeUI();
  updatePixPanelSummary(updateCartTotals());
}

function selectFulfillment(button) {
  invalidatePendingCustomerOrder("fulfillment_changed");
  document.querySelectorAll(".fulfillment-btn").forEach(btn => btn.classList.remove("selected"));
  button.classList.add("selected");

  const mode = button.dataset.fulfillment || "delivery";
  const field = document.getElementById("order-fulfillment");
  if (field) field.value = mode;

  const deliveryFields = getDeliveryFields();
  const deliveryGroup = document.getElementById("delivery-address-group");
  const pickupPanel = document.getElementById("pickup-panel");

  if (deliveryGroup) deliveryGroup.hidden = mode === "pickup";
  if (pickupPanel) pickupPanel.hidden = mode !== "pickup";
  clearEstimateTermsInvalid(deliveryFields.estimateTerms, deliveryFields.estimateAck);

  if (mode === "pickup") {
    clearScheduledAutoDeliveryQuote();
    cancelActiveDeliveryQuoteRequest("pickup_selected");
    cancelActiveViaCepLookup("pickup_selected");
    setDeliveryState(createDeliveryState({
      status: "pickup",
      address: STORE_ADDRESS,
      message: "Retirada no balc\u00e3o, sem taxa de entrega.",
    }));
  } else {
    clearDeliveryQuote(DELIVERY_IDLE_MESSAGE);
    scheduleAutoDeliveryQuote("fulfillment_change");
  }

  updateCartTotals();
}

function copyPixKey() {
  navigator.clipboard?.writeText(PIX_KEY)
    .then(() => showToast(`Chave Pix oficial copiada. No banco, confira se o favorecido \u00e9 ${PIX_BENEFICIARY_NAME}.`))
    .catch(() => showToast(`Chave Pix oficial: ${PIX_KEY}`));
}

function openIfoodStore(event) {
  if (event) event.preventDefault();
  if (!ensureStoreIsOpen(true)) return false;

  if (window.matchMedia("(max-width: 860px)").matches) {
    window.location.href = IFOOD_STORE_URL;
  } else {
    window.open(IFOOD_STORE_URL, "_blank", "noopener");
  }

  return false;
}

function syncStoreConfigUI() {
  const storeAddressLine1 = document.getElementById("footer-store-address-line-1");
  const storeAddressLine2 = document.getElementById("footer-store-address-line-2");
  const footerPhone = document.getElementById("footer-store-phone");
  const deliveryOriginCopy = document.getElementById("delivery-origin-copy");
  const pickupStoreAddress = document.getElementById("pickup-store-address");
  const deliveryCityField = document.getElementById("customer-city");
  const deliveryStateField = document.getElementById("customer-state");
  const orderLinks = document.querySelectorAll('a[onclick*="openIfoodStore"]');
  const localPhoneDigits = String(STORE_WHATSAPP || "").replace(/\D/g, "").replace(/^55/, "");
  const phoneLabel = formatPhoneInput(localPhoneDigits);

  if (storeAddressLine1) {
    storeAddressLine1.textContent = [CONFIGURED_STORE_ADDRESS.street, CONFIGURED_STORE_ADDRESS.number].filter(Boolean).join(", ");
  }

  if (storeAddressLine2) {
    storeAddressLine2.textContent = [
      CONFIGURED_STORE_ADDRESS.neighborhood,
      [CONFIGURED_STORE_ADDRESS.city, CONFIGURED_STORE_ADDRESS.state].filter(Boolean).join("/")
    ].filter(Boolean).join(" - ");
  }

  if (footerPhone && STORE_WHATSAPP) {
    footerPhone.href = `tel:+${STORE_WHATSAPP}`;
    footerPhone.textContent = phoneLabel || footerPhone.textContent;
  }

  if (deliveryOriginCopy) {
    deliveryOriginCopy.textContent = `Origem: ${[CONFIGURED_STORE_ADDRESS.street, CONFIGURED_STORE_ADDRESS.number].filter(Boolean).join(", ")} - ${CONFIGURED_STORE_ADDRESS.neighborhood}/${CONFIGURED_STORE_ADDRESS.state}`;
  }

  if (pickupStoreAddress) {
    pickupStoreAddress.textContent = STORE_ADDRESS;
  }

  if (deliveryCityField && !normalizeText(deliveryCityField.value)) {
    deliveryCityField.value = CONFIGURED_SERVICE_AREA.city;
  }

  if (deliveryStateField && !normalizeText(deliveryStateField.value)) {
    deliveryStateField.value = CONFIGURED_SERVICE_AREA.state;
  }

  orderLinks.forEach(link => {
    if (IFOOD_STORE_URL) {
      link.href = IFOOD_STORE_URL;
    }
  });
}

function getOrderAvailabilityCopy(availability = getStoreAvailability()) {
  const minimumOrderCopy = `Pedido minimo: ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos.`;

  if (isStoreManuallyForcedOpen(availability)) {
    return {
      cartLabel: "Pedidos liberados manualmente",
      cartMessage: "A loja liberou os pedidos manualmente pelo painel. Valide o endereco, revise o pedido e abra o WhatsApp oficial da Galaxy Burger para concluir.",
      checkoutHelper: `Pedidos liberados manualmente pelo painel administrativo. Revise o pedido, abra o WhatsApp oficial da Galaxy Burger e confirme o envio no site para limpar o carrinho. ${minimumOrderCopy}`,
      footerStatus: "Status atual: pedidos abertos manualmente pelo painel."
    };
  }

  if (isStoreManuallyForcedClosed(availability)) {
    return {
      cartLabel: "Loja fechada no momento",
      cartMessage: `${getStoreClosedOrderMessage(availability)} Voce pode montar o carrinho normalmente, mas o envio fica bloqueado ate a reabertura da loja.`,
      checkoutHelper: `${getStoreClosedOrderMessage(availability)} Monte seu carrinho normalmente; o envio pelo WhatsApp fica bloqueado ate a reabertura. ${minimumOrderCopy}`,
      footerStatus: "Status atual: fechada."
    };
  }

  if (!availability.scheduleEnforced) {
    return {
      cartLabel: "Pedidos liberados para teste",
      cartMessage: "Modo de validacao ativo. O bloqueio por horario foi desativado temporariamente para voce testar o checkout, inclusive o envio do pedido para a hamburgueria.",
      checkoutHelper: `Modo de testes ativo: o envio para a hamburgueria esta liberado temporariamente para validar o fluxo completo do pedido. ${minimumOrderCopy}`,
      footerStatus: "Status atual: modo de testes ativo, com pedidos liberados temporariamente."
    };
  }

  if (availability.isOpen) {
    return {
      cartLabel: "Loja aberta no momento",
      cartMessage: "Valide o endereco, revise o pedido e abra o WhatsApp oficial da Galaxy Burger para concluir.",
      checkoutHelper: `Revise o pedido, abra o WhatsApp oficial da Galaxy Burger e confirme o envio no site para limpar o carrinho. ${minimumOrderCopy}`,
      footerStatus: `Status atual: aberta ate ${formatStoreTimeLabel(availability.todaySchedule?.closeMinutes || 0)}.`
    };
  }

  return {
    cartLabel: "Loja fechada no momento",
    cartMessage: `${getStoreClosedOrderMessage(availability)} Voce pode montar o carrinho normalmente, mas o envio do pedido fica liberado apenas no horario de funcionamento.`,
    checkoutHelper: `${getStoreClosedOrderMessage(availability)} Monte seu carrinho normalmente; o envio pelo WhatsApp fica bloqueado ate a reabertura. ${minimumOrderCopy}`,
    footerStatus: `Status atual: fechada. ${formatNextOpeningMessage(availability.nextOpen)}`
  };
}

function updateOrderAvailabilityUI(availability = getStoreAvailability()) {
  const footerStatus = document.getElementById("footer-store-status");
  const cartStatusStrip = document.getElementById("cart-order-status-strip");
  const cartStatusLabel = document.getElementById("cart-order-status-label");
  const cartStatusMessage = document.getElementById("cart-order-status-message");
  const checkoutHelper = document.getElementById("checkout-helper");
  const subtotal = getCartTotal();
  const copy = getOrderAvailabilityCopy(availability);
  const orderLinks = document.querySelectorAll('a[onclick*="openIfoodStore"]');

  orderLinks.forEach(link => {
    if (!link.dataset.defaultLabel) {
      link.dataset.defaultLabel = link.textContent.trim();
    }

    if (IFOOD_STORE_URL) {
      link.href = IFOOD_STORE_URL;
    }

    link.classList.toggle("is-disabled", !availability.isOpen);
    link.setAttribute("aria-disabled", String(!availability.isOpen));
    link.textContent = availability.isOpen ? link.dataset.defaultLabel : "Loja fechada";
  });

  if (cartStatusStrip) {
    cartStatusStrip.dataset.open = String(availability.isOpen);
  }

  if (cartStatusLabel) {
    cartStatusLabel.textContent = copy.cartLabel;
  }

  if (cartStatusMessage) {
    cartStatusMessage.textContent = copy.cartMessage;
  }

  if (checkoutHelper) {
    checkoutHelper.textContent = copy.checkoutHelper;
  }

  if (availability.isOpen && cart.length && cartStatusLabel && cartStatusMessage && !hasReachedMinimumOrder(subtotal)) {
    cartStatusLabel.textContent = "Pedido m\u00ednimo n\u00e3o atingido";
    cartStatusMessage.textContent = `Adicione mais ${formatCurrency(getMinimumOrderShortfall(subtotal))} em produtos para liberar o envio do pedido para a hamburgueria.`;
  }

  if (footerStatus) {
    footerStatus.textContent = copy.footerStatus;
  }
}

function openCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  logCheckoutInfo("Abrindo carrinho.", {
    items: getCartItemsCount(),
    subtotal: getCartTotal()
  });
  cartModalHiddenForOrderTicket = false;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  updateModalCart();
  refreshCatalogAvailability({
    notify: true,
    quiet: true,
    reason: "cart_open"
  });

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    modal.querySelector(".cart-modal-content")?.focus();
  });
}

function closeCartModal() {
  const modal = document.getElementById("cart-modal");
  if (!modal) return;

  logCheckoutInfo("Fechando carrinho.");
  cartModalHiddenForOrderTicket = false;
  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    syncBodyModalState();
  }, 220);
}

function toggleMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const toggle = document.querySelector(".menu-toggle");
  if (!nav || !toggle) return;

  const isOpen = !nav.hidden;

  if (isOpen) {
    closeMobileNav();
    return;
  }

  nav.hidden = false;
  document.body.classList.add("menu-open");
  toggle.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  const nav = document.getElementById("mobile-nav");
  const toggle = document.querySelector(".menu-toggle");
  if (!nav || !toggle) return;

  nav.hidden = true;
  document.body.classList.remove("menu-open");
  toggle.setAttribute("aria-expanded", "false");
}

function formatPaymentLabel(payment) {
  const labels = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    "cartao de credito": "Cart\u00E3o de cr\u00E9dito",
    "cartao de debito": "Cart\u00E3o de d\u00E9bito"
  };

  return labels[payment] || payment;
}

function formatTicketPaymentLabel(payment) {
  const labels = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    "cartao de credito": "Cart\u00e3o de cr\u00e9dito",
    "cartao de debito": "Cart\u00e3o de d\u00e9bito",
    "Cart\u00E3o de cr\u00E9dito": "Cart\u00e3o de cr\u00e9dito",
    "Cart\u00E3o de d\u00E9bito": "Cart\u00e3o de d\u00e9bito"
  };

  return labels[payment] || payment;
}

const TICKET_EMOJI_PATTERN = (() => {
  try {
    return new RegExp("[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u200D\\uFE0F]", "gu");
  } catch {
    return /[\u200D\uFE0F]/g;
  }
})();

function sanitizeTicketText(value) {
  return String(value ?? "")
    .replace(/[#*`_~]/g, "")
    .replace(TICKET_EMOJI_PATTERN, "")
    .trim();
}

function hideCartModalForOrderTicket() {
  const cartModal = document.getElementById("cart-modal");
  if (!cartModal || cartModal.hidden) {
    cartModalHiddenForOrderTicket = false;
    return;
  }

  cartModal.classList.remove("is-visible");
  cartModal.hidden = true;
  cartModalHiddenForOrderTicket = true;
}

function restoreCartModalAfterOrderTicket() {
  if (!cartModalHiddenForOrderTicket) {
    return;
  }

  const cartModal = document.getElementById("cart-modal");
  if (!cartModal) {
    cartModalHiddenForOrderTicket = false;
    return;
  }

  cartModal.hidden = false;

  requestAnimationFrame(() => {
    cartModal.classList.add("is-visible");
    syncBodyModalState();
  });

  cartModalHiddenForOrderTicket = false;
}

function chunkTicketWord(word, maxWidth = ORDER_TICKET_WIDTH) {
  const text = String(word || "");
  const chunks = [];

  for (let index = 0; index < text.length; index += maxWidth) {
    chunks.push(text.slice(index, index + maxWidth));
  }

  return chunks.length ? chunks : [""];
}

function wrapTicketLine(line, maxWidth = ORDER_TICKET_WIDTH) {
  const originalText = String(line ?? "");
  const text = /^https?:\/\//i.test(originalText)
    ? originalText
    : sanitizeTicketText(originalText);

  if (!text) {
    return [""];
  }

  if (text === ORDER_TICKET_DIVIDER) {
    return [text];
  }

  if (/^https?:\/\//i.test(text)) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const wrapped = [];
  let currentLine = "";

  words.forEach(word => {
    const parts = word.length > maxWidth ? chunkTicketWord(word, maxWidth) : [word];

    parts.forEach(part => {
      if (!currentLine) {
        currentLine = part;
        return;
      }

      const candidate = `${currentLine} ${part}`;
      if (candidate.length <= maxWidth) {
        currentLine = candidate;
        return;
      }

      wrapped.push(currentLine);
      currentLine = part;
    });
  });

  if (currentLine) {
    wrapped.push(currentLine);
  }

  return wrapped;
}

function formatTicketLines(lines) {
  const wrappedLines = [];

  lines.forEach(line => {
    wrapTicketLine(line).forEach(wrappedLine => {
      wrappedLines.push(wrappedLine);
    });
  });

  return wrappedLines.join("\n").trim();
}

function generateMapsLink(address) {
  const query = encodeURIComponent(sanitizeTicketText(address));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildDeliveryAddressData({ isPickup, deliveryValues = {}, address = "" }) {
  if (isPickup) {
    return {
      ticketAddressLines: [...STORE_ADDRESS_LINES],
      compactAddressLine: STORE_ADDRESS,
      courierAddressLine: STORE_ADDRESS,
      complementText: "",
      referenceText: "Retirada no local",
      mapsQueryAddress: STORE_ADDRESS
    };
  }

  const street = normalizeText(deliveryValues.street);
  const number = normalizeText(deliveryValues.number);
  const neighborhood = normalizeText(deliveryValues.neighborhood);
  const city = normalizeText(deliveryValues.city);
  const state = normalizeText(deliveryValues.state).toUpperCase();
  const complement = normalizeText(deliveryValues.complement);
  const reference = normalizeText(deliveryValues.reference);
  const cep = formatCep(deliveryValues.cep || "");
  const streetLine = street ? (number ? `${street}, ${number}` : street) : address;
  const cityState = [city, state].filter(Boolean).join("/");
  const locationLine = [neighborhood, cityState].filter(Boolean).join(" - ");
  const ticketAddressLines = [streetLine, locationLine].filter(Boolean);
  const compactAddressLine = [streetLine, complement, neighborhood, cityState]
    .filter(Boolean)
    .join(" - ");

  if (complement) {
    ticketAddressLines.push(`Complemento: ${complement}`);
  }

  if (cep) {
    ticketAddressLines.push(`CEP: ${cep}`);
  }

  const courierAddressLine = [streetLine, locationLine].filter(Boolean).join(" - ") || address;
  const mapsQueryAddress = [streetLine, neighborhood, city, state, cep, "Brasil"]
    .filter(Boolean)
    .join(", ");

  return {
    ticketAddressLines,
    compactAddressLine,
    courierAddressLine,
    complementText: complement,
    referenceText: reference || "N\u00e3o informado",
    mapsQueryAddress: mapsQueryAddress || address
  };
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

function getOrderLineItems() {
  return cart.map(item => {
    const lineTotal = item.price * item.quantity;

    return {
      name: item.name,
      quantity: item.quantity,
      variantLabel: normalizeText(item.variantLabel),
      unitPrice: item.price,
      lineTotal,
      unitPriceLabel: formatCurrency(item.price),
      lineTotalLabel: formatCurrency(lineTotal)
    };
  });
}

function buildTicketItemsLines({ detailed = false } = {}) {
  const orderItems = getOrderLineItems();
  const lines = [];

  orderItems.forEach((item, index) => {
    lines.push(`${item.quantity}x ${item.name}`);

    if (item.variantLabel) {
      lines.push(`Obs item: ${item.variantLabel}`);
    }

    if (detailed) {
      lines.push(`Unit\u00e1rio: ${item.unitPriceLabel}`);
      lines.push(`Total item: ${item.lineTotalLabel}`);
    }

    if (index < orderItems.length - 1) {
      lines.push("");
    }
  });

  return lines;
}

function buildOrderPaymentLines({ paymentMethod, paymentLabel, cashChangeText }) {
  const normalizedPaymentMethod = String(paymentMethod || "").toLowerCase();
  const resolvedPaymentLabel = paymentLabel || formatPaymentLabel(paymentMethod);
  const paymentLines = [];

  if (normalizedPaymentMethod === "pix") {
    paymentLines.push("Pix - aguardando comprovante");
  } else {
    paymentLines.push(resolvedPaymentLabel);
  }

  if (normalizedPaymentMethod === "dinheiro") {
    paymentLines.push(`Troco: ${cashChangeText || "N\u00e3o precisa de troco."}`);
  }

  return paymentLines;
}

function buildOrderAddressPreviewLines({ isPickup, address, deliveryValues }) {
  const addressData = buildDeliveryAddressData({ isPickup, deliveryValues, address });
  const addressLines = [...addressData.ticketAddressLines];

  if (!isPickup) {
    addressLines.push(`Refer\u00eancia: ${addressData.referenceText}`);
  }

  return {
    addressData,
    addressLines
  };
}

function getDeliveryQuoteStatusCopy(quote) {
  const status = quote?.validationStatus || "";

  if (status === "loading") return "Verificando cota\u00e7\u00e3o no servidor";
  if (status === "invalid") return "Cota\u00e7\u00e3o inv\u00e1lida ou comanda alterada";
  if (status === "expired") return "Cota\u00e7\u00e3o expirada";
  if (isManualZoneMetadata({
    precision: quote?.locationPrecision,
    source: quote?.geocoderSource
  })) {
    return "Taxa confirmada para este endere\u00e7o";
  }

  return "Taxa validada pelo servidor";
}

function getDeliveryQuotePrecisionCopy(quote, options = {}) {
  return getDeliveryLocationMethodCopy({
    precision: quote?.locationPrecision,
    source: quote?.geocoderSource,
    includeProvider: options.includeProvider !== false
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeBase64UrlText(value) {
  const text = String(value || "");
  let binary = "";

  if (typeof TextEncoder === "function") {
    const bytes = new TextEncoder().encode(text);

    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
  } else {
    binary = encodeURIComponent(text).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlText(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);

  if (typeof TextDecoder === "function") {
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new TextDecoder().decode(bytes);
  }

  let encodedText = "";

  for (let index = 0; index < binary.length; index += 1) {
    encodedText += `%${binary.charCodeAt(index).toString(16).padStart(2, "0")}`;
  }

  return decodeURIComponent(encodedText);
}

function resolveOrderTicketBaseUrl() {
  const configuredBaseUrl = normalizeText(PUBLIC_ORDER_TICKET_BASE_URL);
  if (configuredBaseUrl) {
    try {
      return new URL(configuredBaseUrl);
    } catch {
      return null;
    }
  }

  const currentHref = String(window?.location?.href || "").trim();
  const isHttpPage = /^https?:\/\//i.test(currentHref);
  if (!isHttpPage) {
    return null;
  }

  try {
    const currentUrl = new URL(currentHref);
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(currentUrl.hostname);
    if (isLocalHost) {
      return null;
    }

    return currentUrl;
  } catch {
    return null;
  }
}

function buildSharedOrderTicketUrl(orderDetails) {
  const baseUrl = resolveOrderTicketBaseUrl();

  if (!orderDetails || !baseUrl) {
    return "";
  }

  const sharedPayload = {
    d: orderDetails.createdAt,
    n: orderDetails.name,
    c: orderDetails.customerPhone || "",
    o: orderDetails.notes,
    p: orderDetails.isPickup ? 1 : 0,
    m: orderDetails.mapsLink || "",
    y: Array.isArray(orderDetails.paymentLines) ? orderDetails.paymentLines : [],
    f: Number(orderDetails.deliveryFeeValue || 0),
    s: Number(orderDetails.subtotalValue || 0),
    t: Number(orderDetails.totalValue || 0),
    v: orderDetails.isPickup ? [] : [
      orderDetails.deliveryValues?.cep || "",
      orderDetails.deliveryValues?.street || "",
      orderDetails.deliveryValues?.number || "",
      orderDetails.deliveryValues?.neighborhood || "",
      orderDetails.deliveryValues?.city || "",
      orderDetails.deliveryValues?.state || "",
      orderDetails.deliveryValues?.complement || "",
      orderDetails.deliveryValues?.reference || ""
    ],
    q: orderDetails.deliveryQuote
      ? [
          orderDetails.deliveryQuote.token || "",
          orderDetails.deliveryQuote.code || "",
          orderDetails.deliveryQuote.expiresAt || "",
          Number(orderDetails.deliveryQuote.distanceKm || 0),
          Number(orderDetails.deliveryQuote.routeDistanceKm || 0),
          orderDetails.deliveryQuote.zone || "",
          orderDetails.deliveryQuote.zoneLabel || "",
          orderDetails.deliveryQuote.addressKey || "",
          orderDetails.deliveryQuote.locationPrecision || "",
          orderDetails.deliveryQuote.geocoderSource || ""
        ]
      : [],
    i: Array.isArray(orderDetails.items)
      ? orderDetails.items.map(item => [
          Number(item.quantity || 0),
          item.name || "",
          item.variantLabel || "",
          Number(item.unitPrice || 0)
        ])
      : []
  };
  const url = new URL(baseUrl.toString());

  url.search = "";
  url.hash = "";
  url.searchParams.set("t", encodeBase64UrlText(JSON.stringify(sharedPayload)));
  return url.toString();
}

function decodeSharedOrderTicketPayload(encodedTicket) {
  if (!encodedTicket) {
    return null;
  }

  try {
    const rawPayload = JSON.parse(decodeBase64UrlText(encodedTicket));
    const isPickup = Boolean(rawPayload.p);
    const rawDeliveryValues = Array.isArray(rawPayload.v) ? rawPayload.v : [];
    const deliveryValues = isPickup ? {} : {
      cep: normalizeCep(rawDeliveryValues[0]),
      street: normalizeText(rawDeliveryValues[1]),
      number: normalizeText(rawDeliveryValues[2]),
      neighborhood: normalizeText(rawDeliveryValues[3]),
      city: normalizeText(rawDeliveryValues[4]),
      state: normalizeText(rawDeliveryValues[5]).toUpperCase(),
      complement: normalizeText(rawDeliveryValues[6]),
      reference: normalizeText(rawDeliveryValues[7])
    };
    const addressData = buildDeliveryAddressData({
      isPickup,
      deliveryValues,
      address: Array.isArray(rawPayload.a)
        ? rawPayload.a.map(line => normalizeText(line)).filter(Boolean).join(" - ")
        : ""
    });
    const items = Array.isArray(rawPayload.i)
      ? rawPayload.i.map(item => {
          const quantity = Number(item?.[0] || 0);
          const name = normalizeText(item?.[1]);
          const variantLabel = normalizeText(item?.[2]);
          const unitPrice = Number(item?.[3] || 0);
          const lineTotal = quantity * unitPrice;

          return {
            name,
            quantity,
            variantLabel,
            unitPrice,
            lineTotal,
            unitPriceLabel: formatCurrency(unitPrice),
            lineTotalLabel: formatCurrency(lineTotal)
          };
        }).filter(item => item.name && item.quantity > 0)
      : [];
    const subtotalValue = Number(rawPayload.s || 0);
    const totalValue = Number(rawPayload.t || 0);
    const deliveryFeeValue = Number(rawPayload.f || 0);
    const rawQuote = Array.isArray(rawPayload.q) ? rawPayload.q : [];
    const usesExtendedQuoteShape = rawQuote.length >= 10;
    const deliveryQuote = !isPickup && rawQuote.length
      ? {
          token: String(rawQuote[0] || "").trim(),
          code: normalizeText(rawQuote[1]),
          expiresAt: String(rawQuote[2] || "").trim(),
          distanceKm: Number(rawQuote[3] || 0),
          routeDistanceKm: usesExtendedQuoteShape ? Number(rawQuote[4] || rawQuote[3] || 0) : Number(rawQuote[3] || 0),
          zone: normalizeText(rawQuote[usesExtendedQuoteShape ? 5 : 4]),
          zoneLabel: normalizeText(rawQuote[usesExtendedQuoteShape ? 6 : 5]),
          addressKey: normalizeText(rawQuote[usesExtendedQuoteShape ? 7 : 6]),
          locationPrecision: normalizeText(rawQuote[usesExtendedQuoteShape ? 8 : 7]),
          geocoderSource: normalizeText(rawQuote[usesExtendedQuoteShape ? 9 : 8]),
          validationStatus: "loading"
        }
      : null;

    return {
      createdAt: normalizeText(rawPayload.d) || getOrderCreatedAtLabel(),
      name: normalizeText(rawPayload.n),
      customerPhone: formatPhoneInput(rawPayload.c),
      notes: normalizeText(rawPayload.o),
      isPickup,
      fulfillmentLabel: isPickup ? "Retirada" : "Entrega",
      items,
      itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
      addressLines: [...addressData.ticketAddressLines, ...(isPickup ? [] : [`Refer\u00eancia: ${addressData.referenceText}`])],
      mapsLink: String(rawPayload.m || "").trim(),
      paymentSummary: Array.isArray(rawPayload.y)
        ? rawPayload.y.map(line => normalizeText(line)).filter(Boolean).join(" | ")
        : "",
      paymentLines: Array.isArray(rawPayload.y)
        ? rawPayload.y.map(line => normalizeText(line)).filter(Boolean)
        : [],
      addressData,
      deliveryValues,
      deliveryQuote,
      deliveryFeeValue,
      deliveryFeeLabel: isPickup ? "Sem taxa de entrega" : formatCurrency(deliveryFeeValue),
      feeLabelTitle: isPickup ? "Retirada" : "Entrega validada",
      subtotalValue,
      subtotalLabel: formatCurrency(subtotalValue),
      totalValue,
      totalLabel: formatCurrency(totalValue)
    };
  } catch {
    return null;
  }
}

function buildOrderTicketPreviewMarkup(orderDetails) {
  if (!orderDetails) {
    return `<p class="empty-cart">Nenhuma comanda pronta no momento.</p>`;
  }

  const addressMarkup = orderDetails.addressLines
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const paymentMarkup = orderDetails.paymentLines
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const itemsMarkup = orderDetails.items
    .map(item => `
      <article class="order-ticket-item">
        <div class="order-ticket-item-copy">
          <strong>${escapeHtml(`${item.quantity}x ${item.name}`)}</strong>
          ${item.variantLabel ? `<span>${escapeHtml(item.variantLabel)}</span>` : ""}
          <small>${escapeHtml(`${item.unitPriceLabel} por unidade`)}</small>
        </div>
        <strong class="order-ticket-item-total">${escapeHtml(item.lineTotalLabel)}</strong>
      </article>
    `)
    .join("");
  const notesMarkup = orderDetails.notes
    ? `<p>${escapeHtml(orderDetails.notes)}</p>`
    : `<p>Sem observa\u00e7\u00f5es adicionais.</p>`;
  const mapsLinkMarkup = !orderDetails.isPickup && orderDetails.mapsLink
    ? `<a class="order-ticket-link" href="${escapeHtml(orderDetails.mapsLink)}" target="_blank" rel="noopener noreferrer">Abrir no mapa</a>`
    : "";
  const deliveryQuoteMarkup = !orderDetails.isPickup && orderDetails.deliveryQuote?.code
    ? `
      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Valida\u00e7\u00e3o da entrega</span>
        <div class="order-ticket-note">
          <p>${escapeHtml(getDeliveryQuoteStatusCopy(orderDetails.deliveryQuote))}</p>
          <p>${escapeHtml(`C\u00f3digo: ${orderDetails.deliveryQuote.code}`)}</p>
          ${orderDetails.deliveryQuote.zoneLabel ? `<p>${escapeHtml(orderDetails.deliveryQuote.zoneLabel)}</p>` : ""}
          ${orderDetails.deliveryQuote.routeDistanceKm ? `<p>${escapeHtml(`Dist\u00e2ncia real por rota: ${formatDistanceKm(orderDetails.deliveryQuote.routeDistanceKm)}`)}</p>` : orderDetails.deliveryQuote.distanceKm ? `<p>${escapeHtml(`Dist\u00e2ncia calculada: ${formatDistanceKm(orderDetails.deliveryQuote.distanceKm)}`)}</p>` : ""}
          ${getDeliveryQuotePrecisionCopy(orderDetails.deliveryQuote) ? `<p>${escapeHtml(getDeliveryQuotePrecisionCopy(orderDetails.deliveryQuote))}</p>` : ""}
        </div>
      </section>
    `
    : "";

  return `
    <div class="order-ticket-sheet">
      <div class="order-ticket-sheet-header">
        <div>
          <span class="order-ticket-brand">Galaxy Burger</span>
          <strong>Comanda detalhada</strong>
          <span>Gerada em ${escapeHtml(orderDetails.createdAt)}</span>
          ${orderDetails.orderCode ? `<span>${escapeHtml(`Código ${orderDetails.orderCode}`)}</span>` : ""}
        </div>
        <div>
          <span>${escapeHtml(orderDetails.fulfillmentLabel)}</span>
          <strong>${escapeHtml(orderDetails.totalLabel)}</strong>
          <span>${escapeHtml(`${orderDetails.itemsCount} item(ns) no pedido`)}</span>
        </div>
      </div>

      <div class="order-ticket-meta-grid">
        <div class="order-ticket-meta-card">
          <span>Cliente</span>
          <strong>${escapeHtml(orderDetails.name)}</strong>
        </div>
        <div class="order-ticket-meta-card">
          <span>Telefone</span>
          <strong>${escapeHtml(orderDetails.customerPhone || "N\u00e3o informado")}</strong>
        </div>
        <div class="order-ticket-meta-card">
          <span>Pagamento</span>
          <strong>${escapeHtml(orderDetails.paymentSummary)}</strong>
        </div>
        <div class="order-ticket-meta-card">
          <span>Status</span>
          <strong>${escapeHtml(orderDetails.statusLabel || "Pronto para abrir no WhatsApp")}</strong>
        </div>
      </div>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">${escapeHtml(orderDetails.fulfillmentLabel)}</span>
        <div class="order-ticket-address">${addressMarkup}</div>
        ${mapsLinkMarkup}
      </section>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Itens</span>
        <div class="order-ticket-items">${itemsMarkup}</div>
      </section>

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Observa\u00e7\u00f5es</span>
        <div class="order-ticket-note">${notesMarkup}</div>
      </section>

      ${deliveryQuoteMarkup}

      <section class="order-ticket-section">
        <span class="order-ticket-section-label">Pagamento</span>
        <div class="order-ticket-payment">${paymentMarkup}</div>
        <div class="order-ticket-totals">
          <div class="order-ticket-total-row">
            <span>Subtotal dos produtos</span>
            <strong>${escapeHtml(orderDetails.subtotalLabel)}</strong>
          </div>
          <div class="order-ticket-total-row">
            <span>${escapeHtml(orderDetails.feeLabelTitle)}</span>
            <strong>${escapeHtml(orderDetails.deliveryFeeLabel)}</strong>
          </div>
          <div class="order-ticket-total-row is-total">
            <span>Total do pedido</span>
            <strong>${escapeHtml(orderDetails.totalLabel)}</strong>
          </div>
        </div>
      </section>
    </div>
  `;
}

function buildOrderTicketPrintDocument(orderDetails) {
  const previewMarkup = buildOrderTicketPreviewMarkup(orderDetails);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comanda Galaxy Burger</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: Arial, sans-serif;
      background: #f3f3f3;
      color: #111111;
    }
    .print-shell {
      width: min(100%, 420px);
      margin: 0 auto;
      padding: 18px;
      border: 1px solid #d6d6d6;
      background: #ffffff;
    }
    .order-ticket-sheet { display: grid; gap: 16px; }
    .order-ticket-sheet-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d9d9d9;
    }
    .order-ticket-sheet-header p { margin: 0; }
    .order-ticket-sheet-header strong {
      display: block;
      margin-top: 4px;
      font-size: 1.35rem;
    }
    .order-ticket-sheet-header span,
    .order-ticket-section-label,
    .order-ticket-meta-card span,
    .order-ticket-total-row span,
    .order-ticket-item-copy small {
      color: #5a5a5a;
      font-size: 0.84rem;
    }
    .order-ticket-brand {
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #1b5d3f;
    }
    .order-ticket-meta-grid,
    .order-ticket-actions {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
    }
    .order-ticket-meta-card,
    .order-ticket-section {
      padding: 12px;
      border: 1px solid #d9d9d9;
      border-radius: 12px;
      background: #ffffff;
    }
    .order-ticket-meta-card strong,
    .order-ticket-total-row strong,
    .order-ticket-item-total {
      color: #111111;
    }
    .order-ticket-address,
    .order-ticket-payment,
    .order-ticket-note {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }
    .order-ticket-address p,
    .order-ticket-payment p,
    .order-ticket-note p {
      margin: 0;
    }
    .order-ticket-link,
    .order-ticket-actions {
      display: none !important;
    }
    .order-ticket-items {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .order-ticket-item {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-top: 10px;
      border-top: 1px solid #e5e5e5;
    }
    .order-ticket-item:first-child {
      padding-top: 0;
      border-top: 0;
    }
    .order-ticket-item-copy strong,
    .order-ticket-item-copy span,
    .order-ticket-item-copy small {
      display: block;
    }
    .order-ticket-item-copy span {
      margin-top: 5px;
      font-size: 0.88rem;
    }
    .order-ticket-totals {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .order-ticket-total-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .order-ticket-total-row.is-total {
      padding-top: 10px;
      border-top: 1px dashed #bdbdbd;
    }
    .order-ticket-total-row.is-total span,
    .order-ticket-total-row.is-total strong {
      color: #000000;
      font-size: 1rem;
      font-weight: 700;
    }
    @page {
      margin: 8mm;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .print-shell {
        width: auto;
        margin: 0;
        padding: 0;
        border: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-shell">${previewMarkup}</div>
  <script>
    window.addEventListener("load", () => {
      window.setTimeout(() => window.print(), 120);
    });
  </script>
</body>
</html>`;
}

function getCartItemsCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function buildWhatsAppOrderMessage({
  name,
  customerPhone,
  isPickup,
  address,
  deliveryValues,
  deliveryQuote,
  deliveryFee,
  subtotal,
  total,
  paymentMethod,
  paymentLabel,
  cashChangeText,
  notes,
  createdAt,
  ticketUrl
}) {
  const addressData = buildDeliveryAddressData({ isPickup, deliveryValues, address });
  const itemsCount = getCartItemsCount();
  const paymentLines = buildOrderPaymentLines({
    paymentMethod,
    paymentLabel: formatTicketPaymentLabel(paymentMethod || paymentLabel),
    cashChangeText
  }).map(line => line === "Pix - aguardando comprovante" ? "Pix - AGUARDANDO COMPROVANTE" : line);

  const lines = [
    "NOTA - GALAXY BURGER",
    ORDER_TICKET_DIVIDER,
    "NOVO PEDIDO",
    `Data: ${createdAt || getOrderCreatedAtLabel()}`,
    ""
  ];

  if (isPickup) {
    lines.push(
      "RETIRADA:",
      addressData.compactAddressLine || STORE_ADDRESS
    );
  } else {
    lines.push(
      "ENTREGA:",
      addressData.compactAddressLine || address,
      `Refer\u00eancia: ${addressData.referenceText}`
    );
  }

  lines.push(
    "",
    `Nome: ${name}`,
    `Telefone: ${customerPhone || "Nao informado"}`,
    `Pedido: ${itemsCount}`,
    "",
    "Itens:",
    ...buildTicketItemsLines({ detailed: false })
  );

  if (notes) {
    lines.push(
      "",
      "Observa\u00e7\u00f5es:",
      notes
    );
  }

  lines.push(
    "",
    "Pagamento:",
    ...paymentLines,
    "",
    `Subtotal: ${subtotal}`
  );

  lines.push(`Entrega: ${deliveryFee}`);

  if (!isPickup && deliveryQuote?.code) {
    lines.push(
      "",
      "Validacao da entrega:",
      `${deliveryQuote.code}${deliveryQuote.zoneLabel ? ` | ${deliveryQuote.zoneLabel}` : ""}${deliveryQuote.distanceKm ? ` | ${formatDistanceKm(deliveryQuote.distanceKm)}` : ""}`
    );

    const precisionLine = getDeliveryQuotePrecisionCopy(deliveryQuote, { includeProvider: false });
    if (precisionLine) {
      lines.push(precisionLine);
    }
  }

  lines.push(
    `Total: ${total}`,
    "",
    ORDER_TICKET_DIVIDER,
    "Pedido sujeito a confirma\u00e7\u00e3o."
  );

  if (ticketUrl) {
    lines.push(
      "",
      "Comanda para impress\u00e3o:",
      ticketUrl
    );
  }

  return formatTicketLines(lines);
}

function encodeWhatsAppMessage(message) {
  return encodeURIComponent(String(message || "").replace(/\r\n/g, "\n").trim());
}

function buildWhatsAppUrl(message) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();
  const encodedMessage = encodeWhatsAppMessage(normalizedMessage);
  return `${WHATSAPP_ORDER_BASE_URL}?phone=${encodeURIComponent(STORE_WHATSAPP)}&text=${encodedMessage}&type=phone_number&app_absent=0`;
}

function buildWhatsAppDeepLink(message) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();
  const encodedMessage = encodeWhatsAppMessage(normalizedMessage);
  return `whatsapp://send?phone=${encodeURIComponent(STORE_WHATSAPP)}&text=${encodedMessage}`;
}

function isProbablyMobileCheckoutClient() {
  const userAgent = String(window.navigator?.userAgent || "");
  const matchesMobileViewport = typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 860px)").matches;

  return matchesMobileViewport
    || /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(userAgent)
    || Number(window.navigator?.maxTouchPoints || 0) > 1;
}

function clearActiveWhatsAppAttempt(attempt = activeWhatsAppAttempt) {
  if (!attempt) return;

  if (attempt.fallbackTimer) {
    window.clearTimeout(attempt.fallbackTimer);
  }

  if (attempt.failureTimer) {
    window.clearTimeout(attempt.failureTimer);
  }

  if (activeWhatsAppAttempt === attempt) {
    activeWhatsAppAttempt = null;
  }
}

function finalizeSuccessfulOrderSubmission(attempt, trigger) {
  if (!attempt || attempt.completed) return;

  attempt.completed = true;
  clearActiveWhatsAppAttempt(attempt);

  logCheckoutInfo("Pedido encaminhado para o WhatsApp.", {
    trigger,
    source: attempt.source,
    urlLength: attempt.browserUrl.length
  });
}

function handleWhatsAppOpenFailure(attempt) {
  if (!attempt || attempt.completed || activeWhatsAppAttempt !== attempt) return;

  clearActiveWhatsAppAttempt(attempt);
  resetOrderSubmissionButtons();
  logCheckoutWarn("Falha ao abrir o WhatsApp automaticamente.", {
    source: attempt.source,
    urlLength: attempt.browserUrl.length
  });
  showToast("N\u00e3o foi poss\u00edvel abrir o WhatsApp agora. Verifique o bloqueio do navegador e toque novamente.");
}

function openWhatsAppOrder(message, options = {}) {
  const normalizedMessage = String(message || "").replace(/\r\n/g, "\n").trim();

  if (!normalizedMessage) {
    throw new Error("Mensagem do pedido vazia.");
  }

  if (!STORE_WHATSAPP) {
    throw new Error("WhatsApp da loja não configurado.");
  }

  const browserUrl = buildWhatsAppUrl(normalizedMessage);
  const deepLinkUrl = buildWhatsAppDeepLink(normalizedMessage);
  const source = options.source || "checkout";
  const shouldPreferDeepLink = options.preferDeepLink ?? isProbablyMobileCheckoutClient();

  clearActiveWhatsAppAttempt();

  const attempt = {
    source,
    browserUrl,
    deepLinkUrl,
    completed: false,
    fallbackTimer: 0,
    failureTimer: 0
  };

  activeWhatsAppAttempt = attempt;

  logCheckoutInfo("Tentando abrir o WhatsApp.", {
    source,
    preferDeepLink: shouldPreferDeepLink,
    urlLength: browserUrl.length
  });

  if (shouldPreferDeepLink) {
    attempt.fallbackTimer = window.setTimeout(() => {
      if (activeWhatsAppAttempt !== attempt || attempt.completed || document.visibilityState === "hidden") {
        return;
      }

      logCheckoutWarn("WhatsApp app n\u00e3o respondeu; usando fallback web.", { source });
      window.location.href = browserUrl;
    }, WHATSAPP_FALLBACK_DELAY_MS);

    window.location.href = deepLinkUrl;
  } else {
    const popup = window.open(browserUrl, "_blank", "noopener");
    if (!popup) {
      handleWhatsAppOpenFailure(attempt);
      return browserUrl;
    }

    finalizeSuccessfulOrderSubmission(attempt, "popup");
    return browserUrl;
  }

  attempt.failureTimer = window.setTimeout(() => {
    if (activeWhatsAppAttempt !== attempt || attempt.completed || document.visibilityState === "hidden") {
      return;
    }

    handleWhatsAppOpenFailure(attempt);
  }, WHATSAPP_OPEN_CHECK_DELAY_MS);

  return browserUrl;
}

function submitPendingOrder(preview, options = {}) {
  const orderPreview = preview || pendingOrderPreview;
  const shouldCloseReviewModal = Boolean(options.closeReviewModal);
  const source = options.source || "checkout";

  if (!orderPreview) {
    logCheckoutWarn("Tentativa de envio sem comanda preparada.");
    showToast("Monte o pedido novamente antes de enviar.");
    return false;
  }

  if (!normalizeText(orderPreview.whatsAppMessage)) {
    logCheckoutWarn("Tentativa de envio sem mensagem de WhatsApp preparada.", orderPreview);
    showToast("Não foi possível montar a mensagem do pedido. Tente novamente.");
    return false;
  }

  savePendingCustomerOrder(orderPreview);
  openWhatsAppOrder(orderPreview.whatsAppMessage, { source });
  resetOrderSubmissionButtons();

  if (shouldCloseReviewModal) {
    closeOrderTicketModal({ restoreCart: false });
  }

  closeCartModal();
  showToast("Pedido salvo como pendente. Depois de enviar no WhatsApp, volte e confirme no aviso do pedido.");

  return true;
}

function renderOrderTicketPreview() {
  const preview = document.getElementById("order-ticket-preview");
  if (!preview) return;

  preview.innerHTML = buildOrderTicketPreviewMarkup(pendingOrderPreview);
}

function updateOrderTicketModalMode() {
  const title = document.getElementById("order-ticket-modal-title");
  const label = document.getElementById("order-ticket-mode-label");
  const message = document.getElementById("order-ticket-mode-message");
  const actions = document.getElementById("order-ticket-actions");
  const backButton = document.getElementById("order-ticket-back-button");
  const printButton = document.getElementById("order-ticket-print-button");
  const confirmButton = document.getElementById("order-ticket-confirm-button");

  if (orderTicketModalMode === "shared") {
    if (actions) actions.dataset.mode = "shared";
    if (title) title.textContent = "Comanda da loja";
    if (label) label.textContent = "Comanda recebida no WhatsApp";
    if (message) message.textContent = "Abra esta comanda no PC da loja e imprima direto na impressora de fita do balc\u00e3o.";
    if (backButton) backButton.textContent = "Voltar ao site";
    if (printButton) printButton.hidden = false;
    if (printButton) printButton.textContent = "Imprimir na fita";
    if (confirmButton) confirmButton.hidden = true;
    return;
  }

  if (actions) actions.dataset.mode = "checkout";
  if (title) title.textContent = "Revise seu pedido";
  if (label) label.textContent = "Revis\u00e3o final do pedido";
  if (message) message.textContent = "Confira os detalhes, abra o WhatsApp e depois confirme no site quando a mensagem for enviada. A loja usar\u00e1 o link seguro da comanda para imprimir o pedido.";
  if (backButton) backButton.textContent = "Voltar ao checkout";
  if (printButton) printButton.hidden = true;
  if (confirmButton) confirmButton.hidden = false;
  if (confirmButton) confirmButton.textContent = "Abrir WhatsApp";
}

function openOrderTicketModal(mode = "checkout") {
  const modal = document.getElementById("order-ticket-modal");
  if (!modal) return;

  orderTicketModalMode = mode;
  if (mode === "checkout") {
    hideCartModalForOrderTicket();
  } else {
    cartModalHiddenForOrderTicket = false;
  }

  if (pendingOrderPreview) {
    pendingOrderPreview = {
      ...pendingOrderPreview,
      statusLabel: mode === "shared" ? "Pronto para imprimir" : "Pronto para abrir no WhatsApp"
    };
  }

  updateOrderTicketModalMode();
  renderOrderTicketPreview();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.body.classList.toggle("ticket-view-active", mode === "shared");

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    modal.querySelector(".order-ticket-modal-content")?.focus();
  });
}

function closeOrderTicketModal(options = {}) {
  const modal = document.getElementById("order-ticket-modal");
  if (!modal) return;
  const wasSharedMode = orderTicketModalMode === "shared";
  const shouldRestoreCart = options.restoreCart !== false && !wasSharedMode;

  modal.classList.remove("is-visible");

  setTimeout(() => {
    modal.hidden = true;
    if (wasSharedMode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("order");
      url.searchParams.delete("t");
      url.searchParams.delete("ticket");
      url.searchParams.delete("ref");
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      document.body.classList.remove("ticket-view-active");
      pendingOrderPreview = null;
      orderTicketModalMode = "checkout";
    }

    if (shouldRestoreCart) {
      restoreCartModalAfterOrderTicket();
    } else {
      cartModalHiddenForOrderTicket = false;
    }

    syncBodyModalState();
  }, 220);
}

function printOrderTicket() {
  if (!pendingOrderPreview) {
    showToast("Nenhuma comanda pronta para imprimir.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=520,height=760");

  if (!printWindow) {
    showToast("N\u00e3o foi poss\u00edvel abrir a janela de impress\u00e3o.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildOrderTicketPrintDocument(pendingOrderPreview));
  printWindow.document.close();
}

function confirmOrderTicket() {
  const confirmButton = document.getElementById("order-ticket-confirm-button");

  if (confirmButton?.dataset.busy === "true") {
    logCheckoutWarn("Clique ignorado: confirmacao da comanda ja esta em andamento.");
    return;
  }

  if (!pendingOrderPreview) {
    logCheckoutWarn("Tentativa de confirmar comanda sem preview.");
    showToast("Monte a comanda novamente antes de enviar.");
    return;
  }

  if (!pendingOrderPreview.sharedTicketUrl) {
    logCheckoutWarn("Comanda segura sem link p\u00fablico configurado.", pendingOrderPreview);
  }
  setOrderTicketConfirmButtonBusy(true);

  try {
    const wasSubmitted = submitPendingOrder(pendingOrderPreview, {
      closeReviewModal: true,
      source: "review"
    });

    if (!wasSubmitted) {
      resetOrderSubmissionButtons();
    }
  } catch (error) {
    logCheckoutError("Falha ao abrir o WhatsApp do pedido.", error);
    showToast("N\u00e3o foi poss\u00edvel abrir o WhatsApp agora. Tente novamente.");
    resetOrderSubmissionButtons();
  }
}

async function verifyPendingOrderPreviewDeliveryQuote() {
  if (!pendingOrderPreview || pendingOrderPreview.isPickup || !pendingOrderPreview.deliveryQuote?.token) {
    return;
  }

  const addressKey = buildDeliveryAddressKey(pendingOrderPreview.deliveryValues || {});

  pendingOrderPreview = {
    ...pendingOrderPreview,
    deliveryQuote: {
      ...pendingOrderPreview.deliveryQuote,
      validationStatus: "loading"
    }
  };
  renderOrderTicketPreview();

  try {
    const verification = await verifyDeliveryQuoteToken(pendingOrderPreview.deliveryQuote.token, addressKey);
    const verifiedQuote = verification.quote || {};
    const isFeeMatch = Number(verifiedQuote.fee || 0) === Number(pendingOrderPreview.deliveryFeeValue || 0);

    pendingOrderPreview = {
      ...pendingOrderPreview,
      deliveryQuote: {
        ...pendingOrderPreview.deliveryQuote,
        code: verifiedQuote.code || pendingOrderPreview.deliveryQuote.code,
        distanceKm: Number(verifiedQuote.distanceKm || pendingOrderPreview.deliveryQuote.distanceKm || 0),
        routeDistanceKm: Number(verifiedQuote.routeDistanceKm || verifiedQuote.distanceKm || pendingOrderPreview.deliveryQuote.routeDistanceKm || pendingOrderPreview.deliveryQuote.distanceKm || 0),
        zone: verifiedQuote.zone || pendingOrderPreview.deliveryQuote.zone,
        zoneLabel: verifiedQuote.zoneLabel || pendingOrderPreview.deliveryQuote.zoneLabel,
        addressKey: verifiedQuote.addressKey || pendingOrderPreview.deliveryQuote.addressKey,
        locationPrecision: verifiedQuote.locationPrecision || pendingOrderPreview.deliveryQuote.locationPrecision,
        geocoderSource: verifiedQuote.geocoderSource || pendingOrderPreview.deliveryQuote.geocoderSource,
        validationStatus: isFeeMatch ? "verified" : "invalid"
      }
    };
  } catch (error) {
    const code = error.payload?.code || error.code || "";

    pendingOrderPreview = {
      ...pendingOrderPreview,
      deliveryQuote: {
        ...pendingOrderPreview.deliveryQuote,
        validationStatus: code === "quote_expired" ? "expired" : "invalid"
      }
    };
  }

  renderOrderTicketPreview();
}

async function handleSharedOrderTicketFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const encodedTicket = searchParams.get("ticket")
    || searchParams.get("order")
    || searchParams.get("t")
    || searchParams.get("ref");
  if (!encodedTicket) return;

  let decodedTicket = null;
  let fetchError = null;

  try {
    decodedTicket = await fetchPreparedOrderTicket(encodedTicket);
  } catch (error) {
    fetchError = error;
  }

  if (!decodedTicket) {
    decodedTicket = decodeSharedOrderTicketPayload(encodedTicket);
  }

  if (!decodedTicket && fetchError) {
    logCheckoutError("Falha ao abrir a comanda segura pelo servidor.", fetchError);
  }

  if (!decodedTicket) return;

  pendingOrderPreview = decodedTicket;
  openOrderTicketModal("shared");
  verifyPendingOrderPreviewDeliveryQuote();
}

function validateCheckout() {
  const contactFields = getCheckoutContactFields();
  const nameField = contactFields.name;
  const phoneField = contactFields.phone;
  const payment = getPaymentFields();
  const paymentField = payment.field;
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  const subtotal = getCartTotal();

  if (!cart.length) {
    logCheckoutWarn("Checkout bloqueado: carrinho vazio.");
    showToast("Seu pedido est\u00e1 vazio.");
    return false;
  }

  const unavailableCartItems = getUnavailableCartItems();
  if (unavailableCartItems.length) {
    logCheckoutWarn("Checkout bloqueado: item indisponível no carrinho.", unavailableCartItems);
    showToast("Remova os itens indisponíveis do carrinho para continuar.");
    return false;
  }

  if (!ensureStoreIsOpen(true)) {
    logCheckoutWarn("Checkout bloqueado: loja fechada.");
    return false;
  }

  if (!normalizeText(nameField?.value)) {
    setFieldInvalid(nameField);
    logCheckoutWarn("Checkout bloqueado: nome n\u00e3o informado.");
    showToast("Informe seu nome.");
    return false;
  }

  clearFieldInvalid(nameField);

  if (!isValidPhoneNumber(phoneField?.value)) {
    setFieldInvalid(phoneField);
    logCheckoutWarn("Checkout bloqueado: telefone invalido ou ausente.");
    showToast("Informe seu telefone com DDD para continuar.");
    phoneField?.focus();
    return false;
  }

  clearFieldInvalid(phoneField);

  if (!hasReachedMinimumOrder(subtotal)) {
    logCheckoutWarn("Checkout bloqueado: pedido m\u00ednimo n\u00e3o atingido.", { subtotal });
    showToast(`O pedido m\u00ednimo da Galaxy Burger \u00e9 ${formatCurrency(MIN_ORDER_AMOUNT)} em produtos. Faltam ${formatCurrency(getMinimumOrderShortfall(subtotal))} para continuar.`);
    return false;
  }

  if (!isPickup) {
    if (!validateAddressFields(true)) return false;

    if (deliveryState.status === "loading") {
      logCheckoutWarn("Checkout bloqueado: valida\u00e7\u00e3o da entrega em andamento.");
      showToast("Aguarde a valida\u00e7\u00e3o da entrega.");
      return false;
    }

    if (deliveryState.status === "blocked" || deliveryState.status === "pickup_only") {
      logCheckoutWarn("Checkout bloqueado: bairro sem entrega ativa.", { deliveryState });
      showToast(deliveryState.message || "Escolha retirada no local para continuar.");
      return false;
    }

    if (deliveryState.status === "out_of_range") {
      logCheckoutWarn("Checkout bloqueado: endere\u00e7o fora da \u00e1rea.");
      showToast(deliveryState.message || "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local.");
      return false;
    }

    if (!isDeliveryQuoteFresh(deliveryState)) {
      clearDeliveryQuote("A valida\u00e7\u00e3o da entrega expirou. Valide o endere\u00e7o novamente.");
      logCheckoutWarn("Checkout bloqueado: taxa de entrega sem valida\u00e7\u00e3o ativa.", { deliveryState });
      showToast("Valide o endere\u00e7o novamente antes de finalizar.");
      return false;
    }

    if (deliveryState.status !== "ready" || !deliveryState.quoteToken) {
      logCheckoutWarn("Checkout bloqueado: taxa de entrega n\u00e3o validada.", { deliveryState });
      showToast("Valide a entrega antes de finalizar.");
      return false;
    }

    if (!validateDeliveryEstimateAcceptance(true)) {
      return false;
    }
  }

  clearPaymentInvalid();

  if (!paymentField?.value) {
    setPaymentInvalid();
    payment.buttons[0]?.focus();
    logCheckoutWarn("Checkout bloqueado: forma de pagamento n\u00e3o selecionada.");
    showToast("Escolha uma forma de pagamento.");
    return false;
  }

  const cashChangeSummary = getCashChangeSummary(updateCartTotals().total, true);
  if (!cashChangeSummary) {
    return false;
  }

  return true;
}

async function buildPendingOrderPreview() {
  const contactFields = getCheckoutContactFields();
  const name = normalizeText(contactFields.name?.value);
  const customerPhone = formatPhoneInput(contactFields.phone?.value);
  const notes = normalizeText(contactFields.notes?.value);
  const paymentMethod = document.getElementById("payment-method")?.value || "";
  const isPickup = getCurrentFulfillmentMode() === "pickup";
  let deliveryValues = isPickup ? {} : getDeliveryValues();

  if (!isPickup) {
    const refreshedQuote = await requestDeliveryQuote({
      showMessage: true,
      quietSuccess: true,
      reason: "finalize"
    });

    if (!refreshedQuote || refreshedQuote.status !== "ready" || !refreshedQuote.quoteToken) {
      return null;
    }

    deliveryValues = {
      ...deliveryValues,
      ...(refreshedQuote.validatedAddress || {})
    };
  }

  const address = isPickup ? STORE_ADDRESS : syncDeliveryAddressField();
  const totals = updateCartTotals();
  const cashChangeSummary = getCashChangeSummary(totals.total, false);

  if (!cashChangeSummary) {
    return null;
  }

  const prepared = await prepareValidatedOrderTicket({
    customer: {
      name,
      phone: customerPhone
    },
    notes,
    fulfillment: isPickup ? "pickup" : "delivery",
    payment: {
      method: paymentMethod,
      cashChangeText: cashChangeSummary.cashChangeText
    },
    cart: buildCartPayloadForServer(),
    delivery: isPickup ? null : {
      quoteToken: deliveryState.quoteToken,
      values: {
        ...deliveryValues,
        address
      }
    }
  });

  logCheckoutInfo("Comanda preparada para envio.", {
    items: prepared.order?.itemsCount || 0,
    isPickup,
    paymentMethod,
    sharedTicketIncluded: Boolean(prepared.sharedTicketUrl)
  });

  return {
    ...(prepared.order || {}),
    sharedTicketUrl: prepared.sharedTicketUrl || prepared.order?.sharedTicketUrl || "",
    whatsAppMessage: String(prepared.whatsAppMessage || "").trim()
  };
}

async function finalizeOrder() {
  if (isFinalizeButtonBusy()) {
    logCheckoutWarn("Clique ignorado: envio j\u00e1 est\u00e1 em andamento.");
    return false;
  }

  if (!validateCheckout()) return;
  setFinalizeButtonBusy(true, "Validando entrega...");

  try {
    pendingOrderPreview = await buildPendingOrderPreview();

    if (!pendingOrderPreview) {
      resetOrderSubmissionButtons();
      return false;
    }

    openOrderTicketModal("checkout");
    resetOrderSubmissionButtons();
    return true;
  } catch (error) {
    await syncInventoryAfterOrderError(error);
    logCheckoutError("Falha ao preparar o checkout.", error);
    showToast(error?.message || "N\u00e3o foi poss\u00edvel preparar o pedido agora. Tente novamente.");
    resetOrderSubmissionButtons();
    return false;
  }
}

function bindDeliveryEvents() {
  const fields = getDeliveryFields();
  const contactFields = getCheckoutContactFields();
  const cashFields = getCashChangeFields();

  if (contactFields.name) {
    contactFields.name.addEventListener("input", () => {
      invalidatePendingCustomerOrder("customer_name_changed");
      clearFieldInvalid(contactFields.name);
    });
  }

  if (contactFields.phone) {
    contactFields.phone.addEventListener("input", () => {
      invalidatePendingCustomerOrder("customer_phone_changed");
      contactFields.phone.value = formatPhoneInput(contactFields.phone.value);
      clearFieldInvalid(contactFields.phone);
    });
  }

  if (contactFields.notes) {
    contactFields.notes.addEventListener("input", () => {
      invalidatePendingCustomerOrder("order_notes_changed");
    });
  }

  if (fields.cep) {
    fields.cep.addEventListener("input", () => {
      invalidatePendingCustomerOrder("delivery_cep_changed");
      fields.cep.value = formatCep(fields.cep.value);
      clearFieldInvalid(fields.cep);
      if (normalizeCep(fields.cep.value).length < 8) {
        if (fields.neighborhood) {
          fields.neighborhood.value = "";
          fields.neighborhood.dataset.savedAreaId = "";
          fields.neighborhood.dataset.savedAreaName = "";
        }
        if (fields.city) fields.city.value = "";
        if (fields.state) fields.state.value = "";
        syncNeighborhoodHelperFromSelection();
      }
      clearDeliveryQuote("CEP alterado. Valide a entrega novamente.");
      cancelActiveViaCepLookup("cep_changed");

      if (normalizeCep(fields.cep.value).length === 8) {
        lookupCep(false);
      }
    });
  }

  if (fields.searchCepButton) {
    fields.searchCepButton.addEventListener("click", () => lookupCep(true));
  }

  if (fields.calculateDeliveryButton) {
    fields.calculateDeliveryButton.addEventListener("click", handleCalculateDelivery);
  }

  [fields.street, fields.number, fields.city, fields.state].forEach(field => {
    if (!field) return;

    field.addEventListener("input", () => {
      invalidatePendingCustomerOrder(`delivery_field_changed:${field.id}`);
      clearFieldInvalid(field);
      syncDeliveryAddressField();
      clearDeliveryQuote("Endere\u00e7o alterado. Valide a entrega novamente.");
      scheduleAutoDeliveryQuote("address_change");
    });
  });

  [fields.complement, fields.reference].forEach(field => {
    if (!field) return;

    field.addEventListener("input", () => {
      invalidatePendingCustomerOrder(`delivery_detail_changed:${field.id}`);
      clearFieldInvalid(field);
      syncDeliveryAddressField();
      saveDeliveryData();
    });
  });

  if (fields.estimateAck) {
    fields.estimateAck.addEventListener("change", () => {
      invalidatePendingCustomerOrder("delivery_estimate_ack_changed");
      clearEstimateTermsInvalid(fields.estimateTerms, fields.estimateAck);
      updateDeliveryUI();
      updateCartTotals();
      saveDeliveryData();
    });
  }

  cashFields.typeInputs.forEach(input => {
    input.addEventListener("change", () => {
      invalidatePendingCustomerOrder("cash_change_type_changed");
      clearFieldInvalid(cashFields.valueInput);
      updateCashChangeUI();
    });
  });

  if (cashFields.valueInput) {
    cashFields.valueInput.addEventListener("input", () => {
      invalidatePendingCustomerOrder("cash_change_value_changed");
      clearFieldInvalid(cashFields.valueInput);
      cashFields.valueInput.value = normalizeCurrencyInput(cashFields.valueInput.value);
    });

    cashFields.valueInput.addEventListener("blur", () => {
      cashFields.valueInput.value = formatCurrencyInputValue(cashFields.valueInput.value);
    });
  }
}

function updateStoreStatusUI(availability = getStoreAvailability()) {
  const statusCard = document.getElementById("store-status-card");
  const statusPill = document.getElementById("store-status-pill");
  const statusTitle = document.getElementById("store-status-title");
  const statusMessage = document.getElementById("store-status-message");
  const copy = getStoreHeroStatusCopy(availability);

  if (statusCard) statusCard.dataset.open = String(availability.isOpen);
  if (statusPill) {
    statusPill.textContent = copy.pill;
  }
  if (statusTitle) {
    statusTitle.textContent = copy.title;
  }
  if (statusMessage) {
    statusMessage.textContent = copy.message;
  }

  updateOrderAvailabilityUI(availability);
  updateCartTotals();
}

let cardDescriptionIdSequence = 0;
let cardDescriptionSyncFrame = 0;

function setCardDescriptionExpanded(card, isExpanded) {
  const description = card.querySelector(".card-description");
  const toggle = card.querySelector(".card-description-toggle");
  if (!description || !toggle) return;

  card.classList.toggle("is-description-expanded", isExpanded);
  description.setAttribute("aria-expanded", String(isExpanded));
  toggle.setAttribute("aria-expanded", String(isExpanded));
  toggle.textContent = isExpanded ? "Ocultar ingredientes" : "Ver ingredientes";
}

function toggleCardDescription(source) {
  const card = source.closest(".card");
  if (!card || !card.classList.contains("has-description-toggle")) return;

  setCardDescriptionExpanded(card, !card.classList.contains("is-description-expanded"));
}

function syncExpandableCardDescription(description) {
  const card = description.closest(".card");
  const toggle = card?.querySelector(".card-description-toggle");
  if (!card || !toggle) return;

  const wasExpanded = card.classList.contains("is-description-expanded");

  card.classList.remove("is-description-expanded");
  description.classList.remove("is-expandable");
  description.removeAttribute("aria-expanded");
  description.removeAttribute("role");
  description.removeAttribute("tabindex");
  toggle.removeAttribute("aria-expanded");
  toggle.textContent = "Ver ingredientes";
  toggle.hidden = true;

  const needsToggle = description.scrollHeight > description.clientHeight + 2;
  card.classList.toggle("has-description-toggle", needsToggle);

  if (!needsToggle) {
    return;
  }

  description.classList.add("is-expandable");
  description.setAttribute("role", "button");
  description.setAttribute("tabindex", "0");
  toggle.hidden = false;
  setCardDescriptionExpanded(card, wasExpanded);
}

function syncAllExpandableCardDescriptions() {
  document.querySelectorAll(".card-description").forEach(syncExpandableCardDescription);
}

function requestExpandableCardDescriptionsSync() {
  if (cardDescriptionSyncFrame) {
    window.cancelAnimationFrame(cardDescriptionSyncFrame);
  }

  cardDescriptionSyncFrame = window.requestAnimationFrame(() => {
    cardDescriptionSyncFrame = 0;
    syncAllExpandableCardDescriptions();
  });
}

function setupExpandableCardDescriptions() {
  const descriptions = Array.from(document.querySelectorAll(".card .card-content p"));

  descriptions.forEach(description => {
    description.classList.add("card-description");

    if (!description.id) {
      cardDescriptionIdSequence += 1;
      description.id = `card-description-${cardDescriptionIdSequence}`;
    }

    let toggle = description.parentElement?.querySelector(".card-description-toggle");
    if (!toggle && description.parentElement) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-description-toggle";
      toggle.hidden = true;
      toggle.setAttribute("aria-controls", description.id);
      description.parentElement.insertBefore(toggle, description.parentElement.querySelector(".price"));
    }

    if (!toggle) return;

    if (!description.dataset.expandableBound) {
      description.dataset.expandableBound = "true";
      description.addEventListener("click", () => {
        if (!description.classList.contains("is-expandable")) return;
        toggleCardDescription(description);
      });
      description.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleCardDescription(description);
      });
    }

    if (!toggle.dataset.expandableBound) {
      toggle.dataset.expandableBound = "true";
      toggle.addEventListener("click", () => toggleCardDescription(toggle));
    }
  });

  requestExpandableCardDescriptionsSync();
}

document.addEventListener("DOMContentLoaded", () => {
  /*
    Remove coordenadas antigas salvas por versões anteriores.
    Isso é essencial, porque seu bug pode estar vindo do localStorage antigo.
  */
  LEGACY_DELIVERY_STORAGE_KEYS.forEach(storageKey => {
    localStorage.removeItem(storageKey);
  });

  syncStoreConfigUI();
  updatePendingOrderBanner();
  loadDeliveryData();
  bindDeliveryEvents();
  handleStoreStatusRealtimeRefresh("initial_load");
  handleDeliveryAreasRealtimeRefresh("initial_load");
  updateCashChangeUI();
  updateOrderTicketModalMode();
  updateUI();
  updateDeliveryUI();
  updateStoreStatusUI();
  inventoryRealtimeChannel = createInventoryRealtimeChannel();
  refreshCatalogAvailability({
    notify: true,
    quiet: true,
    reason: "initial_load"
  });
  handleSharedOrderTicketFromUrl();
  setupExpandableCardDescriptions();
  window.setInterval(() => updateStoreStatusUI(), 60000);
  window.setInterval(() => {
    handleStoreStatusRealtimeRefresh("scheduled_refresh");
  }, STORE_STATUS_REFRESH_INTERVAL_MS);
  window.setInterval(() => {
    refreshCatalogAvailability({
      notify: true,
      quiet: true,
      reason: "scheduled_refresh"
    });
  }, INVENTORY_REFRESH_INTERVAL_MS);
  window.setInterval(() => {
    handleDeliveryAreasRealtimeRefresh("scheduled_refresh");
  }, DELIVERY_AREAS_REFRESH_INTERVAL_MS);
  window.addEventListener("resize", requestExpandableCardDescriptionsSync);
  window.addEventListener("focus", () => {
    handleStoreStatusRealtimeRefresh("window_focus");
    refreshCatalogAvailability({
      notify: true,
      quiet: true,
      reason: "window_focus"
    });
    handleDeliveryAreasRealtimeRefresh("window_focus");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      return;
    }

    handleStoreStatusRealtimeRefresh("tab_visible");
    refreshCatalogAvailability({
      notify: true,
      quiet: true,
      reason: "tab_visible"
    });
    handleDeliveryAreasRealtimeRefresh("tab_visible");
  });
  window.addEventListener("storage", event => {
    if (event.key !== STORE_STATUS_BROADCAST_STORAGE_KEY || !event.newValue) {
      return;
    }

    handleStoreStatusRealtimeRefresh("admin_store_status_broadcast");
  });

  window.addEventListener("storage", event => {
    if (event.key !== DELIVERY_AREAS_BROADCAST_STORAGE_KEY || !event.newValue) {
      return;
    }

    handleDeliveryAreasRealtimeRefresh("admin_broadcast");
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      requestExpandableCardDescriptionsSync();
    });
  }

  window.addEventListener("load", requestExpandableCardDescriptionsSync, { once: true });

  const pixKeyDisplay = document.getElementById("pix-key-display");
  if (pixKeyDisplay) {
    pixKeyDisplay.textContent = PIX_KEY;
  }

  const pixBeneficiaryDisplay = document.getElementById("pix-beneficiary-display");
  if (pixBeneficiaryDisplay) {
    pixBeneficiaryDisplay.textContent = PIX_BENEFICIARY_NAME;
  }

  window.addEventListener("error", event => {
    logCheckoutError("Erro global capturado no checkout.", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", event => {
    logCheckoutError("Promise rejeitada sem tratamento no checkout.", event.reason);
  });

  window.addEventListener("storage", event => {
    if (event.key !== INVENTORY_BROADCAST_STORAGE_KEY || !event.newValue) {
      return;
    }

    const payload = parseInventoryRealtimePayload(event.newValue);
    if (!payload) {
      return;
    }

    handleRealtimeInventoryUpdate(payload, {
      notify: true,
      quiet: true,
      reason: "admin_broadcast"
    });
  });

  if (inventoryRealtimeChannel) {
    inventoryRealtimeChannel.addEventListener("message", event => {
      handleRealtimeInventoryUpdate(event.data, {
        notify: true,
        reason: "admin_channel"
      });
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeOrderTicketModal();
      closeCartModal();
      closeComboDrinkModal();
      closeMobileNav();
    }
  });
});




