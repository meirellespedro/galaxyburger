const { createHmac, timingSafeEqual } = require("crypto");

const VIA_CEP_BASE_URL = "https://viacep.com.br/ws";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 12000;
const QUOTE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_DEV_SECRET = "galaxy-burger-local-delivery-dev-secret";
const USER_AGENT = "GalaxyBurgerDelivery/2.0 (+https://galaxyburger.vercel.app/)";
const MAPS_LANGUAGE = "pt-BR";
const MAPS_REGION = "br";
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
  "praca",
  "praca",
  "alameda",
  "ladeira"
]);
const INVALID_HOUSE_NUMBER_VALUES = new Set([
  "s/n",
  "sn",
  "sem numero",
  "sem numero.",
  "sem numero,"
]);
const BRAZILIAN_STATE_NAME_BY_CODE = Object.freeze({
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapa",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceara",
  DF: "Distrito Federal",
  ES: "Espirito Santo",
  GO: "Goias",
  MA: "Maranhao",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Para",
  PB: "Paraiba",
  PR: "Parana",
  PE: "Pernambuco",
  PI: "Piaui",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondonia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "Sao Paulo",
  SE: "Sergipe",
  TO: "Tocantins"
});
const BRAZILIAN_STATE_ALIAS_TO_CODE = Object.freeze(Object.entries(BRAZILIAN_STATE_NAME_BY_CODE).reduce((aliases, [code, name]) => {
  aliases[normalizeCompareText(code)] = code;
  aliases[normalizeCompareText(name)] = code;
  return aliases;
}, {}));

const STORE_ADDRESS = Object.freeze({
  street: "Rua Embaixador Muniz Gordilho",
  number: "199",
  neighborhood: "Campo Grande",
  city: "Rio de Janeiro",
  state: "RJ",
  cep: "23070010",
  country: "Brasil"
});
const STORE_LOCATION = Object.freeze({
  lat: -22.9024174,
  lng: -43.5777858
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
const routeCache = new Map();

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
        res.status(200).json({
          ok: true,
          status: "online",
          code: "delivery_quote_api_online",
          message: "API de entrega online. Use POST para calcular a taxa ou GET com token para validar uma cota\u00e7\u00e3o existente.",
          usage: {
            calculateQuote: {
              method: "POST",
              path: "/api/delivery-quote",
              requiredFields: ["cep", "street", "number", "neighborhood", "city", "state"]
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
      message: "M\u00e9todo n\u00e3o suportado."
    });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);

    res.status(statusCode).json({
      ok: false,
      status: error.status || "error",
      code: error.code || "delivery_quote_failed",
      message: error.message || "N\u00e3o foi poss\u00edvel validar a entrega agora.",
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
      throw createError("invalid_json", "JSON inv\u00e1lido no corpo da requisi\u00e7\u00e3o.", 400);
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
    throw createError("invalid_json", "JSON inv\u00e1lido no corpo da requisi\u00e7\u00e3o.", 400);
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

function normalizeStreetLabel(value) {
  return normalizeCompareText(value)
    .replace(/[.,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStateCode(value) {
  const normalized = normalizeCompareText(value)
    .replace(/[.]/g, "")
    .trim();

  return BRAZILIAN_STATE_ALIAS_TO_CODE[normalized] || normalizeText(value).toUpperCase();
}

function resolveStateDisplayName(value) {
  const stateCode = normalizeStateCode(value);
  return BRAZILIAN_STATE_NAME_BY_CODE[stateCode] || normalizeText(value);
}

function statesLookCompatible(left, right) {
  if (!left || !right) {
    return true;
  }

  const leftCode = normalizeStateCode(left);
  const rightCode = normalizeStateCode(right);

  if (leftCode && rightCode) {
    return leftCode === rightCode;
  }

  return normalizeCompareText(left) === normalizeCompareText(right);
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

function roundDistanceKm(value) {
  return Math.round(Number(value || 0) * 10) / 10;
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

function getMapsApiKey() {
  const apiKey = normalizeText(
    process.env.GOOGLE_MAPS_API_KEY
    || process.env.GOOGLE_MAPS_SERVER_API_KEY
  );

  if (!apiKey) {
    throw createError(
      "missing_maps_api_key",
      "A integra\u00e7\u00e3o de mapas da entrega n\u00e3o foi configurada corretamente no servidor.",
      500
    );
  }

  return apiKey;
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

function streetsLookCompatible(left, right) {
  const normalizedLeft = normalizeStreetLabel(left);
  const normalizedRight = normalizeStreetLabel(right);

  if (!normalizedLeft || !normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = tokenizeComparableAddressText(normalizedLeft);
  const rightTokens = tokenizeComparableAddressText(normalizedRight);

  if (!leftTokens.length || !rightTokens.length) {
    return false;
  }

  const matchedTokens = leftTokens.filter(leftToken =>
    rightTokens.some(rightToken => areAddressTokensCompatible(leftToken, rightToken))
  );

  return matchedTokens.length / leftTokens.length >= 0.75;
}

function tokenizeComparableAddressText(value) {
  return normalizeStreetLabel(value)
    .split(" ")
    .map(token => token.trim())
    .filter(token => token && !ADDRESS_STOP_WORDS.has(token));
}

function areAddressTokensCompatible(left, right) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (left.includes(right) || right.includes(left)) {
    return true;
  }

  const maxTokenLength = Math.max(left.length, right.length);
  const maxDistance = maxTokenLength >= 5 ? 1 : 0;
  return levenshteinDistanceWithin(left, right, maxDistance);
}

function levenshteinDistanceWithin(left, right, maxDistance) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return false;
  }

  const previousRow = new Array(right.length + 1);
  const currentRow = new Array(right.length + 1);

  for (let index = 0; index <= right.length; index += 1) {
    previousRow[index] = index;
  }

  for (let row = 1; row <= left.length; row += 1) {
    currentRow[0] = row;
    let rowMin = currentRow[0];

    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      currentRow[column] = Math.min(
        previousRow[column] + 1,
        currentRow[column - 1] + 1,
        previousRow[column - 1] + cost
      );
      rowMin = Math.min(rowMin, currentRow[column]);
    }

    if (rowMin > maxDistance) {
      return false;
    }

    for (let column = 0; column <= right.length; column += 1) {
      previousRow[column] = currentRow[column];
    }
  }

  return previousRow[right.length] <= maxDistance;
}

function numbersLookCompatible(left, right) {
  const normalizedLeft = normalizeCompareText(left).replace(/\s+/g, "");
  const normalizedRight = normalizeCompareText(right).replace(/\s+/g, "");

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftDigits = normalizedLeft.replace(/\D/g, "");
  const rightDigits = normalizedRight.replace(/\D/g, "");

  return Boolean(leftDigits) && leftDigits === rightDigits;
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
    ["number", "Informe o n\u00famero da resid\u00eancia."],
    ["neighborhood", "Informe o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe o estado."]
  ];
  const missing = requiredFields.find(([field]) => !address[field]);

  if (missing) {
    throw createError("missing_address_field", missing[1], 422);
  }

  if (INVALID_HOUSE_NUMBER_VALUES.has(normalizeCompareText(address.number))) {
    throw createError("invalid_house_number", "Informe o n\u00famero da resid\u00eancia para calcular a entrega.", 422);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMessage = "A consulta externa demorou mais do que o esperado.") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createError("maps_timeout", timeoutMessage, 504);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchViaCepData(cep) {
  const response = await fetchWithTimeout(
    `${VIA_CEP_BASE_URL}/${normalizeCep(cep)}/json/`,
    {
      headers: {
        "User-Agent": USER_AGENT
      }
    },
    "A valida\u00e7\u00e3o do CEP demorou mais do que o esperado."
  );

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

  if (viaCepData.uf && !statesLookCompatible(submittedAddress.state, viaCepData.uf)) {
    throw createError(
      "cep_state_mismatch",
      "O CEP informado n\u00e3o corresponde ao estado digitado.",
      422,
      { officialAddress }
    );
  }
}

function dedupeAddressQueries(queries) {
  const uniqueQueries = [];
  const seen = new Set();

  queries.forEach(query => {
    const normalized = normalizeCompareText(query);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    uniqueQueries.push(query);
  });

  return uniqueQueries;
}

function buildGoogleGeocodeQueries(address) {
  const stateVariants = dedupeAddressQueries([
    normalizeText(address.state).toUpperCase(),
    resolveStateDisplayName(address.state)
  ]);
  const streetNumber = [address.street, address.number].filter(Boolean).join(", ");
  const cep = formatCep(address.cep);
  const queries = [];

  stateVariants.forEach(stateVariant => {
    queries.push(
      [streetNumber, address.neighborhood, address.city, stateVariant, cep, "Brasil"].filter(Boolean).join(", "),
      [streetNumber, address.city, stateVariant, cep, "Brasil"].filter(Boolean).join(", "),
      [streetNumber, address.neighborhood, address.city, stateVariant, "Brasil"].filter(Boolean).join(", "),
      [streetNumber, address.city, stateVariant, "Brasil"].filter(Boolean).join(", ")
    );
  });

  return dedupeAddressQueries(queries);
}

function buildGoogleGeocodeUrl(query, address) {
  const url = new URL(GOOGLE_GEOCODING_URL);
  url.searchParams.set("address", query);
  url.searchParams.set("key", getMapsApiKey());
  url.searchParams.set("language", MAPS_LANGUAGE);
  url.searchParams.set("region", MAPS_REGION);
  url.searchParams.set(
    "components",
    [
      "country:BR",
      address.cep ? `postal_code:${formatCep(address.cep)}` : "",
      address.city ? `locality:${address.city}` : "",
      address.state ? `administrative_area:${normalizeStateCode(address.state)}` : ""
    ].filter(Boolean).join("|")
  );
  return url.toString();
}

function mapGoogleGeocodeStatus(status, errorMessage = "") {
  if (status === "OK") {
    return;
  }

  if (status === "ZERO_RESULTS") {
    return;
  }

  if (status === "OVER_DAILY_LIMIT" || status === "REQUEST_DENIED") {
    throw createError(
      "maps_configuration_error",
      "A integra\u00e7\u00e3o de mapas da entrega n\u00e3o foi configurada corretamente no servidor.",
      500,
      { providerMessage: errorMessage }
    );
  }

  if (status === "OVER_QUERY_LIMIT") {
    throw createError(
      "maps_rate_limited",
      "O servi\u00e7o de mapas atingiu o limite tempor\u00e1rio de consultas. Tente novamente em instantes.",
      503,
      { providerMessage: errorMessage }
    );
  }

  throw createError(
    "geocode_failed",
    "N\u00e3o foi poss\u00edvel validar esse endere\u00e7o agora.",
    502,
    { providerMessage: errorMessage, providerStatus: status }
  );
}

async function searchGoogleGeocode(query, address) {
  const response = await fetchWithTimeout(
    buildGoogleGeocodeUrl(query, address),
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      }
    },
    "A localiza\u00e7\u00e3o do endere\u00e7o demorou mais do que o esperado."
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw createError(
      "geocode_failed",
      "N\u00e3o foi poss\u00edvel validar esse endere\u00e7o agora.",
      502,
      { providerStatus: payload?.status, providerMessage: payload?.error_message }
    );
  }

  mapGoogleGeocodeStatus(payload?.status, payload?.error_message || "");
  return Array.isArray(payload?.results) ? payload.results : [];
}

function findAddressComponent(components, types) {
  return components.find(component => types.every(type => component.types?.includes(type))) || null;
}

function findAddressComponentText(components, typeGroups, field = "long_name") {
  for (const types of typeGroups) {
    const match = findAddressComponent(components, types);
    const value = normalizeText(match?.[field]);
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeGoogleCandidate(result) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const location = result?.geometry?.location || {};
  const city = findAddressComponentText(components, [
    ["locality"],
    ["administrative_area_level_2"]
  ]);

  return {
    lat: Number(location.lat),
    lng: Number(location.lng),
    formattedAddress: normalizeText(result?.formatted_address),
    placeId: normalizeText(result?.place_id),
    partialMatch: Boolean(result?.partial_match),
    locationType: normalizeText(result?.geometry?.location_type),
    streetNumber: findAddressComponentText(components, [["street_number"]]),
    route: findAddressComponentText(components, [["route"]]),
    neighborhood: findAddressComponentText(components, [
      ["sublocality_level_1", "sublocality", "political"],
      ["sublocality", "political"],
      ["neighborhood", "political"]
    ]),
    city,
    state: findAddressComponentText(components, [["administrative_area_level_1"]], "short_name"),
    postcode: normalizeCep(findAddressComponentText(components, [["postal_code"]])),
    countryCode: normalizeCompareText(findAddressComponentText(components, [["country"]], "short_name"))
  };
}

function resolveCandidatePrecision(candidate) {
  const locationType = normalizeCompareText(candidate.locationType);

  if (candidate.streetNumber && (locationType === "rooftop" || locationType === "range_interpolated")) {
    return "exact";
  }

  if (locationType === "geometric_center") {
    return "street";
  }

  if (locationType === "approximate") {
    return "approximate";
  }

  if (candidate.streetNumber) {
    return "exact";
  }

  return "street";
}

function candidateMatchesAddress(candidate, address) {
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
    return false;
  }

  if (candidate.countryCode && candidate.countryCode !== "br") {
    return false;
  }

  if (candidate.state && !statesLookCompatible(candidate.state, address.state)) {
    return false;
  }

  if (candidate.city && normalizeCompareText(candidate.city) !== normalizeCompareText(address.city)) {
    return false;
  }

  if (candidate.postcode && candidate.postcode !== normalizeCep(address.cep)) {
    return false;
  }

  if (!streetsLookCompatible(address.street, candidate.route)) {
    return false;
  }

  if (candidate.streetNumber && !numbersLookCompatible(address.number, candidate.streetNumber)) {
    return false;
  }

  return true;
}

function scoreCandidate(candidate, address) {
  let score = 0;

  if (candidateMatchesAddress(candidate, address)) {
    score += 100;
  }

  const precision = resolveCandidatePrecision(candidate);

  if (precision === "exact") score += 18;
  if (precision === "street") score += 10;
  if (precision === "approximate") score += 2;
  if (!candidate.partialMatch) score += 8;
  if (candidate.postcode === normalizeCep(address.cep)) score += 8;
  if (candidate.city && normalizeCompareText(candidate.city) === normalizeCompareText(address.city)) score += 6;
  if (candidate.state && statesLookCompatible(candidate.state, address.state)) score += 5;
  if (candidate.route && streetsLookCompatible(candidate.route, address.street)) score += 10;
  if (candidate.streetNumber && numbersLookCompatible(candidate.streetNumber, address.number)) score += 10;
  if (candidate.neighborhood && normalizeCompareText(candidate.neighborhood) === normalizeCompareText(address.neighborhood)) score += 4;

  return score;
}

async function geocodeAddress(address) {
  const cacheKey = buildDeliveryAddressKey(address);

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const queries = buildGoogleGeocodeQueries(address);
  const candidates = [];

  for (const query of queries) {
    const results = await searchGoogleGeocode(query, address);

    results
      .map(normalizeGoogleCandidate)
      .filter(candidate => candidateMatchesAddress(candidate, address))
      .forEach(candidate => candidates.push(candidate));

    const hasHighConfidenceCandidate = candidates.some(candidate => {
      const precision = resolveCandidatePrecision(candidate);
      return precision === "exact" && candidate.streetNumber && numbersLookCompatible(candidate.streetNumber, address.number);
    });

    if (hasHighConfidenceCandidate) {
      break;
    }
  }

  if (!candidates.length) {
    throw createError(
      "address_not_found",
      "N\u00e3o foi poss\u00edvel localizar esse endere\u00e7o automaticamente. Revise a rua, n\u00famero e CEP.",
      422
    );
  }

  const bestCandidate = candidates.sort((left, right) => scoreCandidate(right, address) - scoreCandidate(left, address))[0];
  const resolved = {
    lat: bestCandidate.lat,
    lng: bestCandidate.lng,
    precision: resolveCandidatePrecision(bestCandidate),
    source: "google_maps",
    placeId: bestCandidate.placeId,
    formattedAddress: bestCandidate.formattedAddress
  };

  geocodeCache.set(cacheKey, resolved);
  return resolved;
}

function buildRouteCacheKey(origin, destination) {
  return [
    Number(origin.lat).toFixed(6),
    Number(origin.lng).toFixed(6),
    Number(destination.lat).toFixed(6),
    Number(destination.lng).toFixed(6)
  ].join("|");
}

async function calculateRouteDistanceKm(origin, destination) {
  const cacheKey = buildRouteCacheKey(origin, destination);

  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const response = await fetchWithTimeout(
    GOOGLE_ROUTES_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "X-Goog-Api-Key": getMapsApiKey(),
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng
            }
          }
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: MAPS_LANGUAGE,
        units: "METRIC",
        computeAlternativeRoutes: false
      })
    },
    "O c\u00e1lculo da rota demorou mais do que o esperado."
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const providerStatus = normalizeText(payload?.error?.status);

    if (providerStatus === "RESOURCE_EXHAUSTED") {
      throw createError("maps_rate_limited", "O servi\u00e7o de mapas atingiu o limite tempor\u00e1rio de consultas. Tente novamente em instantes.", 503);
    }

    if (providerStatus === "PERMISSION_DENIED" || providerStatus === "UNAUTHENTICATED") {
      throw createError("maps_configuration_error", "A integra\u00e7\u00e3o de mapas da entrega n\u00e3o foi configurada corretamente no servidor.", 500);
    }

    throw createError("route_failed", "N\u00e3o foi poss\u00edvel calcular a rota de entrega agora.", 502);
  }

  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  const distanceMeters = Number(route?.distanceMeters || 0);

  if (!route || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw createError("route_not_found", "N\u00e3o foi poss\u00edvel calcular a rota de entrega para esse endere\u00e7o.", 422);
  }

  const distanceKm = distanceMeters / 1000;
  routeCache.set(cacheKey, distanceKm);
  return distanceKm;
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

function buildValidatedMessage(zone, distanceKm, precision) {
  const precisionCopy = precision === "exact"
    ? "ponto exato confirmado"
    : precision === "street"
      ? "ponto da rua confirmado"
      : "ponto aproximado confirmado";

  return `Endere\u00e7o validado. Dist\u00e2ncia real calculada: ${distanceKm.toFixed(1).replace(".", ",")} km, com ${precisionCopy}. Taxa confirmada em ${formatCurrency(zone.fee)}.`;
}

async function buildDeliveryQuote(payload) {
  const submittedAddress = sanitizeSubmittedAddress(payload);
  assertSubmittedAddress(submittedAddress);

  const viaCepData = await fetchViaCepData(submittedAddress.cep);
  const officialAddress = buildOfficialAddress(submittedAddress, viaCepData);
  validateOfficialAddress(submittedAddress, officialAddress, viaCepData);

  let customerLocation;

  try {
    customerLocation = await geocodeAddress(officialAddress);
  } catch (error) {
    if (error?.code === "address_not_found") {
      error.officialAddress = officialAddress;
    }

    throw error;
  }

  const routeDistanceKm = await calculateRouteDistanceKm(STORE_LOCATION, customerLocation);
  const distanceKm = roundDistanceKm(routeDistanceKm);
  const zone = resolveDeliveryZone(distanceKm);

  if (zone.value === "out_of_range") {
    return {
      status: "out_of_range",
      fee: 0,
      zone: zone.value,
      zoneLabel: zone.label,
      distanceKm,
      routeDistanceKm: distanceKm,
      locationPrecision: customerLocation.precision,
      geocoderSource: customerLocation.source,
      distanceLabel: zone.label,
      message: "No momento n\u00e3o entregamos para essa regi\u00e3o.",
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
    routeDistanceKm: distanceKm,
    locationPrecision: customerLocation.precision,
    geocoderSource: customerLocation.source,
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
    routeDistanceKm: distanceKm,
    locationPrecision: customerLocation.precision,
    geocoderSource: customerLocation.source,
    distanceLabel: zone.label,
    message: buildValidatedMessage(zone, distanceKm, customerLocation.precision),
    address: officialAddress,
    quote: {
      token: createQuoteToken(quotePayload),
      code: quotePayload.code,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}
