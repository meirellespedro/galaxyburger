const { createHmac, timingSafeEqual } = require("crypto");
const deliveryConfig = require("../delivery-config");
const {
  getDeliveryAreaById,
  getDeliveryAreaByName,
  normalizeDeliveryAreaName
} = require("./_delivery-areas-store");

const QUOTE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEV_SECRET = "galaxy-burger-local-delivery-dev-secret";
const INVALID_HOUSE_NUMBER_VALUES = new Set([
  "s/n",
  "s n",
  "sn",
  "sem numero",
  "sem numero.",
  "sem numero,"
]);

const SERVICE_AREA = Object.freeze(deliveryConfig.serviceArea || {});
const DELIVERY_METADATA = Object.freeze(deliveryConfig.metadata || {});
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(deliveryConfig.normalization?.abbreviations || {})
);
const DELIVERY_MESSAGES = Object.freeze({
  active: "Entrega disponivel para sua regiao. Taxa: {fee}.",
  blocked: "No momento nao entregamos nessa regiao. Voce pode escolher retirada no local.",
  pickupOnly: "Para essa regiao, no momento trabalhamos apenas com retirada no local.",
  outOfRange: "No momento nao entregamos nessa regiao. Voce pode escolher retirada no local."
});

const deliveryQuoteHandler = async function handler(req, res) {
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
    if (req.method === "POST") {
      const payload = await parseJsonBody(req);
      const quote = await buildDeliveryQuote(payload);
      res.status(200).json({
        ok: true,
        ...quote
      });
      return;
    }

    if (req.method === "GET") {
      const token = normalizeText(req.query?.token);
      const addressKey = normalizeText(req.query?.addressKey);

      if (!token) {
        res.status(200).json({
          ok: true,
          status: "online",
          code: "delivery_quote_api_online",
          message: "API de entrega online. Use POST para calcular a taxa ou GET com token para validar uma cotacao existente.",
          usage: {
            calculateQuote: {
              method: "POST",
              path: "/api/delivery-quote",
              requiredFields: ["street", "number", "neighborhood", "city", "state", "deliveryAreaId"]
            },
            verifyQuote: {
              method: "GET",
              path: "/api/delivery-quote?token=SEU_TOKEN",
              optionalFields: ["addressKey"]
            }
          }
        });
        return;
      }

      const quote = verifyQuoteToken(token);
      if (!quote) {
        throw createError("invalid_quote", "A cotacao da entrega e invalida.", 400);
      }

      if (Date.now() > Number(quote.expiresAt || 0)) {
        throw createError("quote_expired", "A cotacao da entrega expirou.", 410);
      }

      if (addressKey && quote.addressKey !== addressKey) {
        throw createError("address_mismatch", "O endereco desta comanda nao bate com a cotacao validada.", 409);
      }

      const area = await assertCurrentDeliveryQuote(quote, {
        neighborhood: quote.deliveryAreaName
      });

      res.status(200).json({
        ok: true,
        status: "verified",
        valid: true,
        quote: {
          code: quote.code,
          fee: quote.fee,
          zone: quote.zone,
          zoneLabel: quote.zoneLabel,
          distanceKm: quote.distanceKm,
          routeDistanceKm: quote.routeDistanceKm,
          locationPrecision: quote.locationPrecision,
          geocoderSource: quote.geocoderSource,
          addressKey: quote.addressKey,
          deliveryAreaId: quote.deliveryAreaId,
          deliveryAreaName: area.name,
          deliveryAreaStatus: area.status,
          expiresAt: new Date(Number(quote.expiresAt || 0)).toISOString()
        }
      });
      return;
    }

    res.status(405).json({
      ok: false,
      status: "error",
      code: "method_not_allowed",
      message: "Metodo nao suportado."
    });
  } catch (error) {
    res.status(Number(error.statusCode || 500)).json({
      ok: false,
      status: error.status || "error",
      code: error.code || "delivery_quote_failed",
      message: error.message || "Nao foi possivel validar a entrega agora.",
      ...(error.officialAddress ? { officialAddress: error.officialAddress } : {})
    });
  }
};

module.exports = deliveryQuoteHandler;

function createError(code, message, statusCode = 400, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw createError("invalid_json", "JSON invalido no corpo da requisicao.", 400);
    }
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw createError("invalid_json", "JSON invalido no corpo da requisicao.", 400);
  }
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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

function buildDeliveryAddressKey(values = {}) {
  return [
    normalizeAddressToken(values.street),
    normalizeAddressToken(values.number),
    normalizeAddressToken(values.neighborhood),
    normalizeAddressToken(values.city),
    normalizeText(values.state).toUpperCase()
  ].join("|");
}

function sanitizeSubmittedAddress(payload = {}) {
  return {
    deliveryAreaId: normalizeText(payload.deliveryAreaId || payload.neighborhoodId || payload.areaId),
    street: normalizeText(payload.street),
    number: normalizeText(payload.number),
    neighborhood: normalizeText(payload.neighborhood),
    complement: normalizeText(payload.complement),
    reference: normalizeText(payload.reference),
    city: normalizeText(payload.city),
    state: normalizeText(payload.state).toUpperCase(),
    cep: normalizeText(payload.cep)
  };
}

function assertSubmittedAddress(address) {
  const requiredFields = [
    ["street", "Informe a rua."],
    ["number", "Informe o numero da residencia."],
    ["neighborhood", "Selecione o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe o estado."],
    ["deliveryAreaId", "Selecione o bairro para calcular a entrega."]
  ];
  const missing = requiredFields.find(([field]) => !address[field]);

  if (missing) {
    throw createError("missing_address_field", missing[1], 422);
  }

  if (INVALID_HOUSE_NUMBER_VALUES.has(normalizeAddressToken(address.number))) {
    throw createError("invalid_house_number", "Informe o numero da residencia para calcular a entrega.", 422);
  }
}

function isSupportedServiceArea(address) {
  const expectedCity = normalizeAddressToken(SERVICE_AREA.city);
  const receivedCity = normalizeAddressToken(address.city);
  const expectedState = normalizeText(SERVICE_AREA.state).toUpperCase();
  const receivedState = normalizeText(address.state).toUpperCase();

  if (!expectedCity || !expectedState) {
    return true;
  }

  const isSupportedCity = expectedCity === receivedCity
    || (expectedCity === "rio de janeiro" && receivedCity === "rio");

  return isSupportedCity && expectedState === receivedState;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
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
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function getQuoteSecret() {
  const configuredSecret = normalizeText(process.env.DELIVERY_QUOTE_SECRET);
  const isVercelRuntime = String(process.env.VERCEL || "") === "1" || Boolean(process.env.VERCEL_ENV);

  if (configuredSecret) {
    return configuredSecret;
  }

  if (isVercelRuntime) {
    throw createError(
      "missing_secret",
      "A validacao de entrega nao foi configurada corretamente no servidor.",
      500
    );
  }

  return DEFAULT_DEV_SECRET;
}

function signValue(value) {
  return createHmac("sha256", getQuoteSecret())
    .update(String(value || ""))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createQuoteToken(quotePayload) {
  const encodedPayload = encodeBase64Url(JSON.stringify(quotePayload));
  return `${encodedPayload}.${signValue(encodedPayload)}`;
}

function verifyQuoteToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  if (!safeCompare(signature, signValue(encodedPayload))) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return null;
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function buildActiveMessage(fee) {
  return DELIVERY_MESSAGES.active.replace("{fee}", formatCurrency(fee));
}

function getDeliveryMessageForStatus(status, fee = 0) {
  if (status === "active") {
    return buildActiveMessage(fee);
  }

  if (status === "pickup_only") {
    return DELIVERY_MESSAGES.pickupOnly;
  }

  if (status === "blocked") {
    return DELIVERY_MESSAGES.blocked;
  }

  return DELIVERY_MESSAGES.outOfRange;
}

function buildZoneLabelForArea(area) {
  if (!area) {
    return "Apenas retirada no local";
  }

  if (area.status === "pickup_only") {
    return "Somente retirada no local";
  }

  if (area.status === "blocked") {
    return "Entrega bloqueada para este bairro";
  }

  return `Taxa cadastrada para ${area.name}`;
}

async function findDeliveryAreaForAddress(address) {
  const byId = address.deliveryAreaId
    ? await getDeliveryAreaById(address.deliveryAreaId)
    : null;

  if (byId) {
    return byId;
  }

  if (!address.neighborhood) {
    return null;
  }

  return getDeliveryAreaByName(address.neighborhood);
}

async function assertCurrentDeliveryQuote(quote, submittedAddress = {}) {
  const currentArea = quote?.deliveryAreaId
    ? await getDeliveryAreaById(quote.deliveryAreaId)
    : await getDeliveryAreaByName(quote?.deliveryAreaName || submittedAddress.neighborhood);

  if (!currentArea) {
    throw createError(
      "delivery_area_missing",
      "O bairro selecionado nao esta mais cadastrado. Escolha outro bairro ou retirada no local.",
      409
    );
  }

  const submittedAreaName = normalizeDeliveryAreaName(submittedAddress.neighborhood || quote?.deliveryAreaName || "");
  if (submittedAreaName && currentArea.normalizedName !== submittedAreaName) {
    throw createError(
      "delivery_area_mismatch",
      "O bairro selecionado mudou. Calcule a entrega novamente antes de finalizar.",
      409
    );
  }

  if (currentArea.status === "blocked") {
    throw createError("delivery_area_blocked", getDeliveryMessageForStatus("blocked"), 409);
  }

  if (currentArea.status === "pickup_only") {
    throw createError("delivery_area_pickup_only", getDeliveryMessageForStatus("pickup_only"), 409);
  }

  if (currentArea.updatedAt !== quote.deliveryAreaUpdatedAt || Number(currentArea.fee || 0) !== Number(quote.fee || 0)) {
    throw createError(
      "delivery_area_changed",
      "A taxa de entrega deste bairro mudou. Calcule a entrega novamente antes de finalizar.",
      409
    );
  }

  return currentArea;
}

function buildQuoteCode(addressKey, issuedAt) {
  const rawCode = signValue(`${addressKey}|${issuedAt}`).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `GB-${rawCode.slice(0, 8)}`;
}

async function buildDeliveryQuote(payload) {
  const submittedAddress = sanitizeSubmittedAddress(payload);
  assertSubmittedAddress(submittedAddress);

  if (!isSupportedServiceArea(submittedAddress)) {
    return {
      status: "out_of_range",
      fee: 0,
      zone: "out_of_range",
      zoneLabel: "Apenas retirada no local",
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      distanceLabel: "Apenas retirada no local",
      message: getDeliveryMessageForStatus("out_of_range"),
      address: submittedAddress
    };
  }

  const area = await findDeliveryAreaForAddress(submittedAddress);

  if (!area) {
    return {
      status: "out_of_range",
      fee: 0,
      zone: "out_of_range",
      zoneLabel: "Apenas retirada no local",
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      distanceLabel: "Apenas retirada no local",
      message: getDeliveryMessageForStatus("out_of_range"),
      address: submittedAddress
    };
  }

  const validatedAddress = {
    ...submittedAddress,
    neighborhood: area.name
  };

  if (area.status === "blocked" || area.status === "pickup_only") {
    return {
      status: area.status,
      fee: 0,
      zone: area.status,
      zoneLabel: buildZoneLabelForArea(area),
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      distanceLabel: buildZoneLabelForArea(area),
      message: getDeliveryMessageForStatus(area.status),
      address: validatedAddress,
      deliveryArea: {
        id: area.id,
        name: area.name,
        status: area.status,
        note: area.note || ""
      }
    };
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + QUOTE_TTL_MS;
  const addressKey = buildDeliveryAddressKey(validatedAddress);
  const quotePayload = {
    code: buildQuoteCode(addressKey, issuedAt),
    fee: Number(area.fee || 0),
    zone: "delivery_area",
    zoneLabel: buildZoneLabelForArea(area),
    distanceKm: 0,
    routeDistanceKm: 0,
    locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
    geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
    addressKey,
    issuedAt,
    expiresAt,
    deliveryAreaId: area.id,
    deliveryAreaName: area.name,
    deliveryAreaUpdatedAt: area.updatedAt,
    deliveryAreaStatus: area.status
  };

  return {
    status: "ready",
    fee: Number(area.fee || 0),
    zone: "delivery_area",
    zoneLabel: buildZoneLabelForArea(area),
    distanceKm: 0,
    routeDistanceKm: 0,
    locationPrecision: quotePayload.locationPrecision,
    geocoderSource: quotePayload.geocoderSource,
    distanceLabel: buildZoneLabelForArea(area),
    message: getDeliveryMessageForStatus("active", area.fee),
    address: validatedAddress,
    deliveryArea: {
      id: area.id,
      name: area.name,
      status: area.status,
      note: area.note || ""
    },
    quote: {
      token: createQuoteToken(quotePayload),
      code: quotePayload.code,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}

module.exports._internals = {
  QUOTE_TTL_MS,
  INVALID_HOUSE_NUMBER_VALUES,
  assertCurrentDeliveryQuote,
  buildDeliveryAddressKey,
  buildDeliveryQuote,
  createError,
  getQuoteSecret,
  isSupportedServiceArea,
  normalizeAddressToken,
  normalizeCompareText,
  normalizeText,
  sanitizeSubmittedAddress,
  assertSubmittedAddress,
  verifyQuoteToken
};
