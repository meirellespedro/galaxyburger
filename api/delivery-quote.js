const { createHmac, timingSafeEqual } = require("crypto");
const deliveryConfig = require("../delivery-config");

const QUOTE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEV_SECRET = "galaxy-burger-local-delivery-dev-secret";
const ADDRESS_STOP_WORDS = new Set([
  "rua",
  "r",
  "avenida",
  "av",
  "travessa",
  "tv",
  "estrada",
  "estr",
  "rodovia",
  "alameda",
  "ladeira"
]);
const INVALID_HOUSE_NUMBER_VALUES = new Set([
  "s/n",
  "s n",
  "sn",
  "sem numero",
  "sem numero.",
  "sem numero,"
]);

const STORE_ADDRESS = Object.freeze(deliveryConfig.store);
const SERVICE_AREA = Object.freeze(deliveryConfig.serviceArea || {});
const DELIVERY_ZONES = Object.freeze(deliveryConfig.zones);
const BLOCKED_RULES = Object.freeze(deliveryConfig.blockedRules);
const DELIVERY_MESSAGES = Object.freeze(deliveryConfig.messages);
const DELIVERY_METADATA = Object.freeze(deliveryConfig.metadata);
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(deliveryConfig.normalization?.abbreviations || {})
);

module.exports = async function handler(req, res) {
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
      const quote = buildDeliveryQuote(payload);
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
              requiredFields: ["street", "number", "neighborhood", "city", "state"]
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

function tokenizeAddressText(value) {
  return normalizeAddressToken(value)
    .split(" ")
    .map(token => token.trim())
    .filter(token => token && !ADDRESS_STOP_WORDS.has(token));
}

function streetTokensLookCompatible(left, right) {
  const leftTokens = tokenizeAddressText(left);
  const rightTokens = tokenizeAddressText(right);

  if (!leftTokens.length || !rightTokens.length) {
    return false;
  }

  return leftTokens.every(leftToken =>
    rightTokens.some(rightToken => {
      if (leftToken === rightToken) {
        return true;
      }

      if (leftToken.length < 4 || rightToken.length < 4) {
        return false;
      }

      return leftToken.startsWith(rightToken) || rightToken.startsWith(leftToken);
    })
  );
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
    ["neighborhood", "Informe o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe o estado."]
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

function ruleMatchesNeighborhood(rule, normalizedNeighborhood) {
  return Array.isArray(rule.neighborhoods)
    && rule.neighborhoods.some(candidate => normalizeAddressToken(candidate) === normalizedNeighborhood);
}

function ruleMatchesStreet(rule, normalizedStreet) {
  return Array.isArray(rule.streetHints)
    && rule.streetHints.some(candidate => streetTokensLookCompatible(candidate, normalizedStreet));
}

function resolveDeliveryRule(address) {
  const normalizedStreet = normalizeAddressToken(address.street);
  const normalizedNeighborhood = normalizeAddressToken(address.neighborhood);

  const blockedRule = BLOCKED_RULES.find(rule =>
    ruleMatchesStreet(rule, normalizedStreet) || ruleMatchesNeighborhood(rule, normalizedNeighborhood)
  );

  if (blockedRule) {
    return {
      status: "out_of_range",
      matchedBy: ruleMatchesStreet(blockedRule, normalizedStreet) ? "street" : "neighborhood",
      ruleName: blockedRule.name,
      zone: null
    };
  }

  for (const zone of DELIVERY_ZONES) {
    if (ruleMatchesStreet(zone, normalizedStreet)) {
      return {
        status: "ready",
        matchedBy: "street",
        ruleName: zone.name,
        zone
      };
    }
  }

  for (const zone of DELIVERY_ZONES) {
    if (ruleMatchesNeighborhood(zone, normalizedNeighborhood)) {
      return {
        status: "ready",
        matchedBy: "neighborhood",
        ruleName: zone.name,
        zone
      };
    }
  }

  return {
    status: "out_of_range",
    matchedBy: "none",
    ruleName: "unsupported_area",
    zone: null
  };
}

function buildQuoteCode(addressKey, issuedAt) {
  const rawCode = signValue(`${addressKey}|${issuedAt}`).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `GB-${rawCode.slice(0, 8)}`;
}

function buildZoneMessage(zone) {
  if (!zone) {
    return DELIVERY_MESSAGES.outOfRange;
  }

  return zone.value === "local"
    ? DELIVERY_MESSAGES.local
    : DELIVERY_MESSAGES.extended;
}

function buildDeliveryQuote(payload) {
  const submittedAddress = sanitizeSubmittedAddress(payload);
  assertSubmittedAddress(submittedAddress);

  if (!isSupportedServiceArea(submittedAddress)) {
    return {
      status: "out_of_range",
      fee: 0,
      zone: "out_of_range",
      zoneLabel: "Acima de 5 km - apenas retirada",
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision,
      geocoderSource: DELIVERY_METADATA.geocoderSource,
      distanceLabel: "Acima de 5 km - apenas retirada",
      message: DELIVERY_MESSAGES.outOfRange,
      address: submittedAddress
    };
  }

  const zoneMatch = resolveDeliveryRule(submittedAddress);

  if (zoneMatch.status === "out_of_range" || !zoneMatch.zone) {
    return {
      status: "out_of_range",
      fee: 0,
      zone: "out_of_range",
      zoneLabel: "Acima de 5 km - apenas retirada",
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision,
      geocoderSource: DELIVERY_METADATA.geocoderSource,
      distanceLabel: "Acima de 5 km - apenas retirada",
      message: DELIVERY_MESSAGES.outOfRange,
      address: submittedAddress
    };
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + QUOTE_TTL_MS;
  const addressKey = buildDeliveryAddressKey(submittedAddress);
  const quotePayload = {
    code: buildQuoteCode(addressKey, issuedAt),
    fee: zoneMatch.zone.fee,
    zone: zoneMatch.zone.value,
    zoneLabel: zoneMatch.zone.label,
    distanceKm: 0,
    routeDistanceKm: 0,
    locationPrecision: DELIVERY_METADATA.locationPrecision,
    geocoderSource: DELIVERY_METADATA.geocoderSource,
    addressKey,
    issuedAt,
    expiresAt
  };

  return {
    status: "ready",
    fee: zoneMatch.zone.fee,
    zone: zoneMatch.zone.value,
    zoneLabel: zoneMatch.zone.label,
    distanceKm: 0,
    routeDistanceKm: 0,
    locationPrecision: DELIVERY_METADATA.locationPrecision,
    geocoderSource: DELIVERY_METADATA.geocoderSource,
    distanceLabel: zoneMatch.zone.label,
    message: buildZoneMessage(zoneMatch.zone),
    address: submittedAddress,
    quote: {
      token: createQuoteToken(quotePayload),
      code: quotePayload.code,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}
