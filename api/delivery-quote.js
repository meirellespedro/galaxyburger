const { createHmac, timingSafeEqual } = require("crypto");

const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const QUOTE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEV_SECRET = "galaxy-burger-local-delivery-dev-secret";
const USER_AGENT = "GalaxyBurgerDelivery/1.0 (+https://galaxyburger.vercel.app/)";

const STORE_ADDRESS = Object.freeze({
  street: "Rua Embaixador Muniz Gordilho",
  number: "199",
  neighborhood: "Campo Grande",
  city: "Rio de Janeiro",
  state: "RJ",
  cep: "23070010",
  country: "Brasil"
});

const DELIVERY_ZONES = Object.freeze([
  Object.freeze({
    value: "local",
    maxDistanceKm: 3,
    fee: 5,
    label: "At\u00e9 3 km da base - R$ 5,00"
  }),
  Object.freeze({
    value: "extended",
    maxDistanceKm: 5,
    fee: 10,
    label: "De 3 km at\u00e9 5 km da base - R$ 10,00"
  })
]);

const geocodeCache = new Map();
let storeCoordinatesPromise = null;

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
        throw createError("missing_token", "Token de cota\u00e7\u00e3o ausente.", 400);
      }

      const quote = verifyQuoteToken(token);
      if (!quote) {
        throw createError("invalid_quote", "A cota\u00e7\u00e3o da entrega \u00e9 inv\u00e1lida.", 400);
      }

      if (Date.now() > Number(quote.expiresAt || 0)) {
        throw createError("quote_expired", "A cota\u00e7\u00e3o da entrega expirou.", 410);
      }

      if (addressKey && quote.addressKey !== addressKey) {
        throw createError("address_mismatch", "O endere\u00e7o desta comanda n\u00e3o bate com a cota\u00e7\u00e3o validada.", 409);
      }

      res.status(200).json({
        ok: true,
        valid: true,
        quote: {
          code: quote.code,
          fee: quote.fee,
          zone: quote.zone,
          zoneLabel: quote.zoneLabel,
          distanceKm: quote.distanceKm,
          addressKey: quote.addressKey,
          expiresAt: new Date(Number(quote.expiresAt || 0)).toISOString()
        }
      });
      return;
    }

    res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "M\u00e9todo n\u00e3o suportado."
    });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);

    res.status(statusCode).json({
      ok: false,
      code: error.code || "delivery_quote_failed",
      message: error.message || "N\u00e3o foi poss\u00edvel validar a entrega agora.",
      ...(error.officialAddress ? { officialAddress: error.officialAddress } : {}),
      ...(error.status ? { status: error.status } : {})
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
    return JSON.parse(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
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

function normalizeCep(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function buildDeliveryAddressKey(values = {}) {
  return [
    normalizeCep(values.cep),
    normalizeCompareText(values.street),
    normalizeCompareText(values.number),
    normalizeCompareText(values.neighborhood),
    normalizeCompareText(values.city),
    normalizeText(values.state).toUpperCase()
  ].join("|");
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
      "A valida\u00e7\u00e3o de entrega n\u00e3o foi configurada corretamente no servidor.",
      500
    );
  }

  return DEFAULT_DEV_SECRET;
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

function signValue(value) {
  const signature = createHmac("sha256", getQuoteSecret())
    .update(String(value || ""))
    .digest("base64");

  return signature
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
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyQuoteToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return null;
  }
}

function streetsLookCompatible(submittedStreet, officialStreet) {
  const submitted = normalizeCompareText(submittedStreet);
  const official = normalizeCompareText(officialStreet);

  if (!submitted || !official) {
    return true;
  }

  return submitted.includes(official) || official.includes(submitted);
}

function sanitizeSubmittedAddress(payload = {}) {
  return {
    cep: normalizeCep(payload.cep),
    street: normalizeText(payload.street),
    number: normalizeText(payload.number),
    neighborhood: normalizeText(payload.neighborhood),
    city: normalizeText(payload.city),
    state: normalizeText(payload.state).toUpperCase()
  };
}

function assertSubmittedAddress(address) {
  if (address.cep.length !== 8) {
    throw createError("invalid_cep", "Informe um CEP v\u00e1lido com 8 n\u00fameros.", 422);
  }

  const requiredFields = [
    ["street", "Informe a rua."],
    ["number", "Informe o n\u00famero."],
    ["neighborhood", "Informe o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe o estado."]
  ];

  const missing = requiredFields.find(([field]) => !address[field]);
  if (missing) {
    throw createError("missing_address_field", missing[1], 422);
  }
}

async function fetchViaCepData(cep) {
  const response = await fetch(`${VIA_CEP_BASE_URL}/${normalizeCep(cep)}/json/`, {
    headers: {
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw createError("via_cep_failed", "N\u00e3o foi poss\u00edvel validar o CEP agora.", 502);
  }

  const data = await response.json();
  if (data.erro) {
    throw createError("cep_not_found", "CEP n\u00e3o encontrado.", 422);
  }

  return data;
}

function buildOfficialAddress(submittedAddress, viaCepData) {
  const officialStreet = normalizeText(viaCepData.logradouro) || submittedAddress.street;
  const officialNeighborhood = normalizeText(viaCepData.bairro) || submittedAddress.neighborhood;
  const officialCity = normalizeText(viaCepData.localidade) || submittedAddress.city;
  const officialState = normalizeText(viaCepData.uf).toUpperCase() || submittedAddress.state;

  return {
    cep: submittedAddress.cep,
    street: officialStreet,
    number: submittedAddress.number,
    neighborhood: officialNeighborhood,
    city: officialCity,
    state: officialState
  };
}

function validateOfficialAddress(submittedAddress, officialAddress, viaCepData) {
  if (viaCepData.logradouro && !streetsLookCompatible(submittedAddress.street, viaCepData.logradouro)) {
    throw createError(
      "cep_street_mismatch",
      "O CEP informado n\u00e3o corresponde \u00e0 rua digitada.",
      422,
      { officialAddress }
    );
  }

  if (viaCepData.bairro && normalizeCompareText(submittedAddress.neighborhood) !== normalizeCompareText(viaCepData.bairro)) {
    throw createError(
      "cep_neighborhood_mismatch",
      "O CEP informado n\u00e3o corresponde ao bairro digitado.",
      422,
      { officialAddress }
    );
  }

  if (viaCepData.localidade && normalizeCompareText(submittedAddress.city) !== normalizeCompareText(viaCepData.localidade)) {
    throw createError(
      "cep_city_mismatch",
      "O CEP informado n\u00e3o corresponde \u00e0 cidade digitada.",
      422,
      { officialAddress }
    );
  }

  if (viaCepData.uf && normalizeText(submittedAddress.state).toUpperCase() !== normalizeText(viaCepData.uf).toUpperCase()) {
    throw createError(
      "cep_state_mismatch",
      "O CEP informado n\u00e3o corresponde ao estado digitado.",
      422,
      { officialAddress }
    );
  }
}

function buildAddressQuery(address) {
  return [
    `${address.street}, ${address.number}`,
    address.neighborhood,
    address.city,
    address.state,
    formatCep(address.cep),
    "Brasil"
  ].filter(Boolean).join(", ");
}

async function geocodeAddress(address) {
  const query = buildAddressQuery(address);
  const cacheKey = normalizeCompareText(query);

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const searchUrl = new URL(NOMINATIM_SEARCH_URL);
  searchUrl.searchParams.set("format", "jsonv2");
  searchUrl.searchParams.set("addressdetails", "1");
  searchUrl.searchParams.set("countrycodes", "br");
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("accept-language", "pt-BR");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw createError("geocode_failed", "N\u00e3o foi poss\u00edvel validar o endere\u00e7o agora.", 502);
  }

  const results = await response.json();
  const firstResult = Array.isArray(results) ? results[0] : null;

  if (!firstResult?.lat || !firstResult?.lon) {
    throw createError(
      "address_not_found",
      "N\u00e3o foi poss\u00edvel localizar esse endere\u00e7o automaticamente. Revise a rua, n\u00famero e CEP.",
      422
    );
  }

  const coordinates = {
    lat: Number(firstResult.lat),
    lon: Number(firstResult.lon)
  };

  geocodeCache.set(cacheKey, coordinates);
  return coordinates;
}

async function getStoreCoordinates() {
  if (!storeCoordinatesPromise) {
    storeCoordinatesPromise = geocodeAddress(STORE_ADDRESS);
  }

  return storeCoordinatesPromise;
}

function roundDistanceKm(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function calculateHaversineDistanceKm(origin, destination) {
  const toRad = degrees => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(destination.lat - origin.lat);
  const dLon = toRad(destination.lon - origin.lon);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

async function calculateRouteDistanceKm(origin, destination) {
  const routeUrl = `${OSRM_ROUTE_URL}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false&alternatives=false&steps=false`;

  try {
    const response = await fetch(routeUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      }
    });

    if (response.ok) {
      const data = await response.json();
      const distanceMeters = Number(data?.routes?.[0]?.distance || 0);

      if (distanceMeters > 0) {
        return distanceMeters / 1000;
      }
    }
  } catch {
    // Se o roteador falhar, caimos no fallback logo abaixo.
  }

  return calculateHaversineDistanceKm(origin, destination) * 1.25;
}

function resolveDeliveryZone(distanceKm) {
  return DELIVERY_ZONES.find(zone => distanceKm <= zone.maxDistanceKm) || {
    value: "out_of_range",
    fee: 0,
    label: "Acima de 5 km - apenas retirada"
  };
}

function buildQuoteCode(addressKey, issuedAt) {
  const rawCode = signValue(`${addressKey}|${issuedAt}`).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `GB-${rawCode.slice(0, 8)}`;
}

async function buildDeliveryQuote(payload) {
  const submittedAddress = sanitizeSubmittedAddress(payload);
  assertSubmittedAddress(submittedAddress);

  const viaCepData = await fetchViaCepData(submittedAddress.cep);
  const officialAddress = buildOfficialAddress(submittedAddress, viaCepData);
  validateOfficialAddress(submittedAddress, officialAddress, viaCepData);

  const [storeCoordinates, customerCoordinates] = await Promise.all([
    getStoreCoordinates(),
    geocodeAddress(officialAddress)
  ]);

  const distanceKm = roundDistanceKm(await calculateRouteDistanceKm(storeCoordinates, customerCoordinates));
  const zone = resolveDeliveryZone(distanceKm);

  if (zone.value === "out_of_range") {
    return {
      status: "out_of_range",
      fee: 0,
      zone: zone.value,
      zoneLabel: zone.label,
      distanceKm,
      distanceLabel: zone.label,
      message: "Esse endere\u00e7o fica fora da rota autom\u00e1tica de entrega da Galaxy Burger. Acima de 5 km, trabalhamos apenas com retirada.",
      address: officialAddress
    };
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + QUOTE_TTL_MS;
  const addressKey = buildDeliveryAddressKey(officialAddress);
  const quotePayload = {
    code: buildQuoteCode(addressKey, issuedAt),
    fee: zone.fee,
    zone: zone.value,
    zoneLabel: zone.label,
    distanceKm,
    addressKey,
    issuedAt,
    expiresAt
  };

  return {
    status: "ready",
    fee: zone.fee,
    zone: zone.value,
    zoneLabel: zone.label,
    distanceKm,
    distanceLabel: zone.label,
    message: `Endere\u00e7o validado. Taxa confirmada em ${formatCurrency(zone.fee)} para ${zone.label.toLowerCase()}.`,
    address: officialAddress,
    quote: {
      token: createQuoteToken(quotePayload),
      code: quotePayload.code,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}
