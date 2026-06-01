const { createHmac, timingSafeEqual } = require("crypto");
const deliveryConfig = require("../delivery-config");
const {
  ACTIVE_DELIVERY_FEE_VALUES,
  getDeliveryAreaById,
  getDeliveryAreaByName,
  normalizeDeliveryAreaName
} = require("./_delivery-areas-store");

const QUOTE_TTL_MS = 15 * 60 * 1000;
const VIACEP_BASE_URL = "https://viacep.com.br/ws";
const BRASIL_API_CEP_BASE_URL = "https://brasilapi.com.br/api/cep/v1";
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
const STORE_ADDRESS = Object.freeze(deliveryConfig.store || {});
const STORE_COORDINATES = Object.freeze(deliveryConfig.store?.coordinates || {});
const DISTANCE_RULES = Object.freeze(deliveryConfig.distanceRules || {});
const PRIORITY_ADDRESS_ZONES = Object.freeze(deliveryConfig.priorityAddressZones || {});
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(deliveryConfig.normalization?.abbreviations || {})
);
const ADDRESS_GEOCODE_CACHE = new Map();
const DELIVERY_MESSAGES = Object.freeze({
  active: "Entrega disponível para sua região. Taxa: {fee}.",
  blocked: "No momento não entregamos nessa região. Você pode escolher retirada no local.",
  pickupOnly: "Para essa região, no momento trabalhamos apenas com retirada no local.",
  outOfRange: "No momento não entregamos nessa região. Você pode escolher retirada no local.",
  incomplete: "Preencha o endereço completo para calcular a entrega."
});
const DISTANCE_RULE_ZONE_META = Object.freeze({
  zone_5: Object.freeze({
    zoneId: "zone_5",
    fee: 5,
    status: "active",
    zoneLabel: "Até 2,9 km da base - R$ 5,00"
  }),
  zone_10: Object.freeze({
    zoneId: "zone_10",
    fee: 10,
    status: "active",
    zoneLabel: "De 3 km até 5 km da base - R$ 10,00"
  }),
  pickup_only: Object.freeze({
    zoneId: "pickup_only",
    fee: 0,
    status: "pickup_only",
    zoneLabel: "A partir de 5,1 km - somente retirada"
  })
});
const DELIVERY_DISPLAY_TEXT_REPLACEMENTS = Object.freeze([
  ["Ate 2,9 km", "Até 2,9 km"],
  ["Ate 2,9 km - R$ 5,00", "Até 2,9 km - R$ 5,00"],
  ["Ate 2,9 km da base - R$ 5,00", "Até 2,9 km da base - R$ 5,00"],
  ["De 3 km ate 5 km", "De 3 km até 5 km"],
  ["De 3 km ate 5 km - R$ 10,00", "De 3 km até 5 km - R$ 10,00"],
  ["De 3 km ate 5 km da base - R$ 10,00", "De 3 km até 5 km da base - R$ 10,00"],
  ["Entrega disponivel para sua regiao. Taxa: {fee}.", "Entrega disponível para sua região. Taxa: {fee}."],
  ["No momento nao entregamos nessa regiao. Voce pode escolher retirada no local.", "No momento não entregamos nessa região. Você pode escolher retirada no local."],
  ["Para essa regiao, no momento trabalhamos apenas com retirada no local.", "Para essa região, no momento trabalhamos apenas com retirada no local."],
  ["Endereco validado", "Endereço validado"],
  ["Taxa automatica para enderecos ate 2,9 km da base.", "Taxa automática para endereços até 2,9 km da base."],
  ["Taxa automatica para enderecos ate 5 km da base.", "Taxa automática para endereços até 5 km da base."],
  ["Atendimento apenas com retirada no local para distancias acima da faixa de entrega.", "Atendimento apenas com retirada no local para distâncias acima da faixa de entrega."],
  ["Entrega bloqueada para esta regiao", "Entrega bloqueada para esta região"]
]);

function formatDeliveryDisplayText(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const replacement = DELIVERY_DISPLAY_TEXT_REPLACEMENTS.find(([source]) => source === text);
  return replacement ? replacement[1] : text;
}
const ADDRESS_TYPE_PREFIX_PATTERN = /^(rua|avenida|alameda|travessa|estrada|rodovia|praca|praia)\s+/;
const cepLookupCache = new Map();
const ADDRESS_GEOCODE_PROVIDERS = Object.freeze([
  {
    name: "photon",
    buildUrl(query) {
      return `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
    },
    parsePayload(payload) {
      const features = Array.isArray(payload?.features) ? payload.features : [];

      for (const feature of features) {
        const coordinates = Array.isArray(feature?.geometry?.coordinates)
          ? feature.geometry.coordinates
          : [];
        const longitude = Number(coordinates[0]);
        const latitude = Number(coordinates[1]);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          continue;
        }

        const type = normalizeCompareText(feature?.properties?.type);
        return {
          latitude,
          longitude,
          precision: type === "house"
            ? "exact"
            : type === "street"
              ? "street"
              : "approximate",
          provider: "photon"
        };
      }

      return null;
    }
  },
  {
    name: "nominatim",
    buildUrl(query) {
      return `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=5&q=${encodeURIComponent(query)}`;
    },
    parsePayload(payload) {
      const items = Array.isArray(payload) ? payload : [];

      for (const item of items) {
        const latitude = Number(item?.lat);
        const longitude = Number(item?.lon);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          continue;
        }

        const addressType = normalizeCompareText(item?.addresstype || item?.type);
        return {
          latitude,
          longitude,
          precision: addressType === "house"
            ? "exact"
            : addressType === "road"
              ? "street"
              : "approximate",
          provider: "nominatim"
        };
      }

      return null;
    }
  }
]);
const CEP_LOOKUP_PROVIDERS = Object.freeze([
  {
    name: "viacep",
    buildUrl: cep => `${VIACEP_BASE_URL}/${cep}/json/`,
    parsePayload(payload) {
      if (!payload || payload.erro) {
        return null;
      }

      return {
        cep: normalizeCep(payload.cep),
        logradouro: normalizeText(payload.logradouro),
        bairro: normalizeText(payload.bairro),
        localidade: normalizeText(payload.localidade),
        uf: normalizeText(payload.uf).toUpperCase()
      };
    }
  },
  {
    name: "brasilapi",
    buildUrl: cep => `${BRASIL_API_CEP_BASE_URL}/${cep}`,
    parsePayload(payload) {
      if (!payload || payload.type === "not_found") {
        return null;
      }

      return {
        cep: normalizeCep(payload.cep),
        logradouro: normalizeText(payload.street),
        bairro: normalizeText(payload.neighborhood),
        localidade: normalizeText(payload.city),
        uf: normalizeText(payload.state).toUpperCase()
      };
    }
  }
]);

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
              requiredFields: ["cep", "street", "number"],
              optionalFields: ["neighborhood", "complement", "reference", "city", "state", "deliveryAreaId"]
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
        throw createError("address_mismatch", "O endereço desta comanda não bate com a cotação validada.", 409);
      }

      const area = await assertCurrentDeliveryQuote(quote, {
        deliveryAreaId: quote.deliveryAreaId,
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
          deliveryAreaId: area.id,
          deliveryAreaName: area.name,
          deliveryAreaStatus: area.status,
          deliveryZoneId: area.zoneId,
          expiresAt: new Date(Number(quote.expiresAt || 0)).toISOString()
        }
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
    res.status(Number(error.statusCode || 500)).json({
      ok: false,
      status: error.status || "error",
      code: error.code || "delivery_quote_failed",
      message: error.message || "Não foi possível validar a entrega agora.",
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

function normalizeAddress(value) {
  return normalizeAddressToken(value);
}

function buildNormalizedAddressVariants(value) {
  const normalized = normalizeAddress(value);
  const variants = new Set();

  if (!normalized) {
    return variants;
  }

  variants.add(normalized);
  variants.add(normalized.replace(ADDRESS_TYPE_PREFIX_PATTERN, "").trim());
  return new Set(Array.from(variants).filter(Boolean));
}

function matchesPriorityAddressZone(value, aliases = []) {
  const candidateVariants = buildNormalizedAddressVariants(value);
  if (!candidateVariants.size || !Array.isArray(aliases) || !aliases.length) {
    return false;
  }

  return aliases.some(alias => {
    const aliasVariants = buildNormalizedAddressVariants(alias);
    return Array.from(aliasVariants).some(aliasVariant => candidateVariants.has(aliasVariant));
  });
}

function normalizeCep(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function normalizeCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : NaN;
}

function hasValidCoordinates(point = {}) {
  return Number.isFinite(normalizeCoordinate(point.latitude))
    && Number.isFinite(normalizeCoordinate(point.longitude));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function roundDistanceKm(value) {
  const distance = Number(value);
  const precisionDecimals = Math.max(0, Number(DISTANCE_RULES.precisionDecimals || 1));

  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }

  const multiplier = 10 ** precisionDecimals;
  return Math.round(distance * multiplier) / multiplier;
}

function calculateAirDistanceKm(from, to) {
  if (!hasValidCoordinates(from) || !hasValidCoordinates(to)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const latitudeDistance = toRadians(normalizeCoordinate(to.latitude) - normalizeCoordinate(from.latitude));
  const longitudeDistance = toRadians(normalizeCoordinate(to.longitude) - normalizeCoordinate(from.longitude));
  const fromLatitude = toRadians(normalizeCoordinate(from.latitude));
  const toLatitude = toRadians(normalizeCoordinate(to.latitude));
  const haversine =
    Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDistance / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusKm * centralAngle;
}

function buildGeocodeQueryCandidates(address = {}) {
  const cep = normalizeCep(address.cep);
  const baseParts = [
    normalizeText(address.street),
    normalizeText(address.number),
    normalizeText(address.neighborhood),
    normalizeText(address.city),
    normalizeText(address.state).toUpperCase(),
    cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : "",
    normalizeText(STORE_ADDRESS.country || "Brasil")
  ];
  const fallbackParts = [
    normalizeText(address.street),
    normalizeText(address.neighborhood),
    normalizeText(address.city),
    normalizeText(address.state).toUpperCase(),
    normalizeText(STORE_ADDRESS.country || "Brasil")
  ];

  return [...new Set([
    baseParts.filter(Boolean).join(", "),
    fallbackParts.filter(Boolean).join(", ")
  ].filter(Boolean))];
}

function classifyDistanceZone(distanceKm) {
  const normalizedDistance = roundDistanceKm(distanceKm);
  const localMaxKm = Number(DISTANCE_RULES.localMaxKm || 2.9);
  const extendedMaxKm = Number(DISTANCE_RULES.extendedMaxKm || 5);

  if (normalizedDistance >= 0 && normalizedDistance <= localMaxKm) {
    return {
      ...DISTANCE_RULE_ZONE_META.zone_5,
      distanceKm: normalizedDistance
    };
  }

  if (normalizedDistance > 0 && normalizedDistance <= extendedMaxKm) {
    return {
      ...DISTANCE_RULE_ZONE_META.zone_10,
      distanceKm: normalizedDistance
    };
  }

  return {
    ...DISTANCE_RULE_ZONE_META.pickup_only,
    distanceKm: normalizedDistance
  };
}

function createDynamicDeliveryArea(address, zone) {
  return {
    id: "",
    name: normalizeText(address.street || address.neighborhood || "Endereço validado"),
    status: zone.status,
    zoneId: zone.zoneId,
    zoneLabel: formatDeliveryDisplayText(zone.zoneLabel),
    note: zone.status === "active"
      ? `Taxa automática para endereços até ${zone.zoneId === "zone_5" ? "2,9 km" : "5 km"} da base.`
      : "Atendimento apenas com retirada no local para distâncias acima da faixa de entrega.",
    updatedAt: ""
  };
}

function buildAreaResponse(area) {
  return {
    id: normalizeText(area?.id),
    name: normalizeText(area?.name),
    status: normalizeText(area?.status || "active"),
    zoneId: normalizeText(area?.zoneId),
    zoneLabel: formatDeliveryDisplayText(area?.zoneLabel),
    note: formatDeliveryDisplayText(area?.note || ""),
    updatedAt: normalizeText(area?.updatedAt)
  };
}

function buildDeliveryAddressKey(values = {}) {
  return [
    normalizeCep(values.cep),
    normalizeDeliveryAreaName(values.neighborhood),
    normalizeAddressToken(values.street),
    normalizeAddressToken(values.number),
    normalizeAddressToken(values.city),
    normalizeText(values.state).toUpperCase()
  ].join("|");
}

function sanitizeSubmittedAddress(payload = {}) {
  return {
    deliveryAreaId: normalizeText(payload.deliveryAreaId || payload.neighborhoodId || payload.areaId),
    cep: normalizeCep(payload.cep),
    street: normalizeText(payload.street),
    number: normalizeText(payload.number),
    neighborhood: normalizeText(payload.neighborhood),
    complement: normalizeText(payload.complement),
    reference: normalizeText(payload.reference),
    city: normalizeText(payload.city || SERVICE_AREA.city),
    state: normalizeText(payload.state || SERVICE_AREA.state).toUpperCase()
  };
}

function assertSubmittedAddress(address) {
  if (!normalizeCep(address.cep) || !normalizeText(address.street) || !normalizeText(address.number)) {
    throw createError("missing_address_field", DELIVERY_MESSAGES.incomplete, 422);
  }

  if (normalizeCep(address.cep).length !== 8) {
    throw createError("invalid_cep", "Informe um CEP valido para calcular a entrega.", 422);
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

  if (configuredSecret) {
    return configuredSecret;
  }

  throw createError(
    "missing_secret",
    "A validação de entrega não foi configurada corretamente neste ambiente.",
    500
  );
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
  return Number(value || 0)
    .toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })
    .replace(/\u00a0/g, " ");
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

  if (normalizeText(area.zoneLabel)) {
    return formatDeliveryDisplayText(area.zoneLabel);
  }

  if (area.status === "pickup_only") {
    return "Somente retirada no local";
  }

  if (area.status === "blocked") {
    return "Entrega bloqueada para esta região";
  }

  return `Taxa cadastrada para ${area.name}`;
}

async function findDeliveryAreaMatchesForAddress(address) {
  const streetArea = address.street
    ? await getDeliveryAreaByName(address.street)
    : null;
  const neighborhoodArea = address.neighborhood
    ? await getDeliveryAreaByName(address.neighborhood)
    : null;
  const explicitArea = !address.deliveryAreaId
    ? null
    : await getDeliveryAreaById(address.deliveryAreaId);

  return {
    streetArea,
    neighborhoodArea,
    explicitArea
  };
}

async function resolveAddressCoordinates(address) {
  if (typeof globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ === "function") {
    const mockedCoordinates = await globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__(address);

    if (mockedCoordinates && hasValidCoordinates(mockedCoordinates)) {
      return {
        latitude: normalizeCoordinate(mockedCoordinates.latitude),
        longitude: normalizeCoordinate(mockedCoordinates.longitude),
        precision: normalizeText(mockedCoordinates.precision) || "approximate",
        provider: normalizeText(mockedCoordinates.provider) || "test"
      };
    }

    if (mockedCoordinates === null) {
      return null;
    }
  }

  if (typeof globalThis.fetch !== "function") {
    throw createError(
      "delivery_distance_lookup_unavailable",
      "Não foi possível calcular a distância desta entrega no servidor agora. Tente novamente em instantes.",
      503
    );
  }

  let hadNetworkFailure = false;
  const queryCandidates = buildGeocodeQueryCandidates(address);

  for (const query of queryCandidates) {
    const cacheKey = normalizeAddressToken(query);
    const cachedMatch = ADDRESS_GEOCODE_CACHE.get(cacheKey);

    if (cachedMatch) {
      return cachedMatch;
    }

    for (const provider of ADDRESS_GEOCODE_PROVIDERS) {
      let response;

      try {
        response = await globalThis.fetch(provider.buildUrl(query), {
          headers: {
            Accept: "application/json",
            "User-Agent": "GalaxyBurgerDelivery/1.0"
          }
        });
      } catch {
        hadNetworkFailure = true;
        continue;
      }

      if (!response.ok) {
        hadNetworkFailure = true;
        continue;
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        hadNetworkFailure = true;
        continue;
      }

      const parsedMatch = provider.parsePayload(payload);
      if (!parsedMatch || !hasValidCoordinates(parsedMatch)) {
        continue;
      }

      ADDRESS_GEOCODE_CACHE.set(cacheKey, parsedMatch);
      return parsedMatch;
    }
  }

  if (hadNetworkFailure) {
    throw createError(
      "delivery_distance_lookup_failed",
      "Não foi possível calcular a distância desta entrega agora. Tente novamente em instantes.",
      503
    );
  }

  return null;
}

async function resolveDeliveryRuleForAddress(officialAddress) {
  const areaMatches = await findDeliveryAreaMatchesForAddress(officialAddress);
  const blockingArea = [areaMatches.streetArea, areaMatches.neighborhoodArea, areaMatches.explicitArea]
    .find(area => area && area.status !== "active");
  const priorityZone5Aliases = Array.isArray(PRIORITY_ADDRESS_ZONES.zone_5)
    ? PRIORITY_ADDRESS_ZONES.zone_5
    : [];
  const priorityZone10Aliases = Array.isArray(PRIORITY_ADDRESS_ZONES.zone_10)
    ? PRIORITY_ADDRESS_ZONES.zone_10
    : [];

  if (blockingArea) {
    return {
      status: blockingArea.status,
      fee: 0,
      zone: normalizeText(blockingArea.zoneId || blockingArea.status),
      zoneLabel: buildZoneLabelForArea(blockingArea),
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      deliveryArea: buildAreaResponse(blockingArea),
      validationMode: "manual_area"
    };
  }

  if (areaMatches.streetArea) {
    return {
      status: areaMatches.streetArea.status === "active" ? "ready" : areaMatches.streetArea.status,
      fee: Number(areaMatches.streetArea.fee || 0),
      zone: normalizeText(areaMatches.streetArea.zoneId || areaMatches.streetArea.status),
      zoneLabel: buildZoneLabelForArea(areaMatches.streetArea),
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      deliveryArea: buildAreaResponse(areaMatches.streetArea),
      validationMode: "manual_area"
    };
  }

  if (matchesPriorityAddressZone(officialAddress.street, priorityZone5Aliases)) {
    const zone = DISTANCE_RULE_ZONE_META.zone_5;
    const area = areaMatches.streetArea || createDynamicDeliveryArea(officialAddress, zone);

    return {
      status: "ready",
      fee: zone.fee,
      zone: zone.zoneId,
      zoneLabel: zone.zoneLabel,
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      deliveryArea: buildAreaResponse({
        ...area,
        status: zone.status,
        zoneId: zone.zoneId,
        zoneLabel: zone.zoneLabel,
        note: normalizeText(area?.note) || "Zona prioritária de até 2,9 km."
      }),
      validationMode: "priority_zone"
    };
  }

  if (matchesPriorityAddressZone(officialAddress.street, priorityZone10Aliases)) {
    const zone = DISTANCE_RULE_ZONE_META.zone_10;
    const area = areaMatches.streetArea || createDynamicDeliveryArea(officialAddress, zone);

    return {
      status: "ready",
      fee: zone.fee,
      zone: zone.zoneId,
      zoneLabel: zone.zoneLabel,
      distanceKm: 0,
      routeDistanceKm: 0,
      locationPrecision: DELIVERY_METADATA.locationPrecision || "manual_zone",
      geocoderSource: DELIVERY_METADATA.geocoderSource || "manual_zone_registry",
      deliveryArea: buildAreaResponse({
        ...area,
        status: zone.status,
        zoneId: zone.zoneId,
        zoneLabel: zone.zoneLabel,
        note: normalizeText(area?.note) || "Zona prioritária de 3 km até 5 km."
      }),
      validationMode: "priority_zone"
    };
  }

  const storeCoordinates = {
    latitude: normalizeCoordinate(STORE_COORDINATES.latitude),
    longitude: normalizeCoordinate(STORE_COORDINATES.longitude)
  };

  if (hasValidCoordinates(storeCoordinates)) {
    const addressCoordinates = await resolveAddressCoordinates(officialAddress);

    if (addressCoordinates) {
      const computedDistanceKm = calculateAirDistanceKm(storeCoordinates, addressCoordinates);
      const distanceZone = classifyDistanceZone(computedDistanceKm);
      const dynamicArea = areaMatches.streetArea
        || areaMatches.neighborhoodArea
        || createDynamicDeliveryArea(officialAddress, distanceZone);

      return {
        status: distanceZone.status === "active" ? "ready" : distanceZone.status,
        fee: distanceZone.fee,
        zone: distanceZone.zoneId,
        zoneLabel: distanceZone.zoneLabel,
        distanceKm: distanceZone.distanceKm,
        routeDistanceKm: 0,
        locationPrecision: normalizeText(addressCoordinates.precision) || "approximate",
        geocoderSource: normalizeText(addressCoordinates.provider) || "photon",
        deliveryArea: buildAreaResponse({
          ...dynamicArea,
          status: distanceZone.status,
          zoneId: distanceZone.zoneId,
          zoneLabel: distanceZone.zoneLabel,
          note: dynamicArea?.note || createDynamicDeliveryArea(officialAddress, distanceZone).note
        }),
        validationMode: "distance"
      };
    }
  }

  throw createError(
    "delivery_distance_required",
      "Não foi possível confirmar a distância dessa entrega agora. Tente novamente em instantes ou escolha retirada no local.",
    503
  );
}

async function fetchCepAddress(cep) {
  const normalizedCep = normalizeCep(cep);
  if (!normalizedCep) {
    throw createError("invalid_cep", "Informe um CEP valido para calcular a entrega.", 422);
  }

  if (cepLookupCache.has(normalizedCep)) {
    return cepLookupCache.get(normalizedCep);
  }

  if (typeof globalThis.__GB_TEST_VIACEP_LOOKUP__ === "function") {
    const mockedData = await globalThis.__GB_TEST_VIACEP_LOOKUP__(normalizedCep);
    if (mockedData && typeof mockedData === "object") {
      cepLookupCache.set(normalizedCep, mockedData);
      return mockedData;
    }
  }

  if (typeof globalThis.fetch !== "function") {
    throw createError(
      "delivery_cep_lookup_unavailable",
      "Não foi possível validar o CEP no servidor agora. Tente novamente em instantes.",
      503
    );
  }

  let hadNetworkFailure = false;

  for (const provider of CEP_LOOKUP_PROVIDERS) {
    let response;

    try {
      response = await globalThis.fetch(provider.buildUrl(normalizedCep), {
        headers: {
          Accept: "application/json"
        }
      });
    } catch {
      hadNetworkFailure = true;
      continue;
    }

    if (!response.ok) {
      hadNetworkFailure = true;
      continue;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      hadNetworkFailure = true;
      continue;
    }

    const normalizedPayload = provider.parsePayload(payload);
    if (!normalizedPayload) {
      continue;
    }

    cepLookupCache.set(normalizedCep, normalizedPayload);
    return normalizedPayload;
  }

  if (hadNetworkFailure) {
    throw createError(
      "delivery_cep_lookup_failed",
      "Não foi possível consultar o CEP agora. Tente novamente em instantes.",
      503
    );
  }

  throw createError("cep_not_found", "CEP não encontrado. Confira os números e tente novamente.", 422);
}

async function resolveOfficialAddressFromCep(submittedAddress) {
  const cepData = await fetchCepAddress(submittedAddress.cep);
  const officialAddress = {
    ...submittedAddress,
    cep: normalizeCep(cepData.cep || submittedAddress.cep),
    street: normalizeText(cepData.logradouro || submittedAddress.street),
    neighborhood: normalizeText(cepData.bairro || submittedAddress.neighborhood),
    city: normalizeText(cepData.localidade || submittedAddress.city),
    state: normalizeText(cepData.uf || submittedAddress.state).toUpperCase()
  };

  if (!officialAddress.neighborhood || !officialAddress.city || !officialAddress.state) {
    throw createError(
      "delivery_neighborhood_unresolved",
      "Não foi possível identificar o bairro por este CEP. Confira o endereço ou escolha retirada no local.",
      422,
      {
        officialAddress
      }
    );
  }

  return officialAddress;
}

async function assertCurrentDeliveryQuote(quote, submittedAddress = {}) {
  const validationMode = normalizeText(quote?.validationMode || "manual_area");
  const hasFullAddress = Boolean(
    normalizeCep(submittedAddress?.cep)
    && normalizeText(submittedAddress?.street)
    && normalizeText(submittedAddress?.number)
  );

  if (validationMode === "distance" || validationMode === "priority_zone") {
    if (!hasFullAddress) {
      const currentArea = quote?.deliveryAreaId
        ? await getDeliveryAreaById(quote.deliveryAreaId)
        : null;

      if (currentArea?.status === "blocked") {
        throw createError("delivery_area_blocked", getDeliveryMessageForStatus("blocked"), 409);
      }

      if (currentArea?.status === "pickup_only") {
        throw createError("delivery_area_pickup_only", getDeliveryMessageForStatus("pickup_only"), 409);
      }

      return buildAreaResponse({
        id: quote?.deliveryAreaId,
        name: quote?.deliveryAreaName,
        status: quote?.deliveryAreaStatus || (Number(quote?.fee || 0) > 0 ? "active" : "pickup_only"),
        zoneId: quote?.deliveryZoneId || quote?.zone,
        zoneLabel: quote?.zoneLabel,
        note: ""
      });
    }

    const officialAddress = await resolveOfficialAddressFromCep(sanitizeSubmittedAddress(submittedAddress));
    const resolvedRule = await resolveDeliveryRuleForAddress(officialAddress);

    if (resolvedRule.status === "blocked") {
      throw createError("delivery_area_blocked", getDeliveryMessageForStatus("blocked"), 409);
    }

    if (resolvedRule.status === "pickup_only") {
      throw createError("delivery_area_pickup_only", getDeliveryMessageForStatus("pickup_only"), 409);
    }

    if (
      Number(resolvedRule.fee || 0) !== Number(quote.fee || 0)
      || normalizeText(resolvedRule.zone) !== normalizeText(quote.zone)
    ) {
      throw createError(
        "delivery_area_changed",
        "A taxa de entrega desta região mudou. Calcule a entrega novamente antes de finalizar.",
        409
      );
    }

    return resolvedRule.deliveryArea;
  }

  const currentArea = quote?.deliveryAreaId
    ? await getDeliveryAreaById(quote.deliveryAreaId)
    : await getDeliveryAreaByName(quote?.deliveryAreaName || submittedAddress.neighborhood);

  if (!currentArea) {
    throw createError(
      "delivery_area_missing",
      "A região selecionada não está mais cadastrada. Escolha outra região ou retirada no local.",
      409
    );
  }

  if (currentArea.status === "blocked") {
    throw createError("delivery_area_blocked", getDeliveryMessageForStatus("blocked"), 409);
  }

  if (currentArea.status === "pickup_only") {
    throw createError("delivery_area_pickup_only", getDeliveryMessageForStatus("pickup_only"), 409);
  }

  if (
    currentArea.updatedAt !== quote.deliveryAreaUpdatedAt
    || Number(currentArea.fee || 0) !== Number(quote.fee || 0)
    || normalizeText(currentArea.zoneId) !== normalizeText(quote.deliveryZoneId)
  ) {
    throw createError(
      "delivery_area_changed",
      "A taxa de entrega desta região mudou. Calcule a entrega novamente antes de finalizar.",
      409
    );
  }

  return buildAreaResponse(currentArea);
}

function buildQuoteCode(addressKey, issuedAt) {
  const rawCode = signValue(`${addressKey}|${issuedAt}`).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `GB-${rawCode.slice(0, 8)}`;
}

function buildUnavailableResponse(status, address, area = null, metadata = {}) {
  return {
    status,
    fee: 0,
    zone: normalizeText(area?.zoneId || status || "out_of_range"),
    zoneLabel: buildZoneLabelForArea(area),
    distanceKm: Number(metadata.distanceKm || 0),
    routeDistanceKm: Number(metadata.routeDistanceKm || 0),
    locationPrecision: normalizeText(metadata.locationPrecision || DELIVERY_METADATA.locationPrecision || "manual_zone"),
    geocoderSource: normalizeText(metadata.geocoderSource || DELIVERY_METADATA.geocoderSource || "manual_zone_registry"),
    distanceLabel: buildZoneLabelForArea(area),
    message: getDeliveryMessageForStatus(status),
    address,
    ...(area ? {
      deliveryArea: {
        id: area.id,
        name: area.name,
        status: area.status,
        zoneId: area.zoneId,
        zoneLabel: area.zoneLabel,
        note: area.note || ""
      }
    } : {})
  };
}

async function buildDeliveryQuote(payload) {
  const submittedAddress = sanitizeSubmittedAddress(payload);
  assertSubmittedAddress(submittedAddress);
  const officialAddress = await resolveOfficialAddressFromCep(submittedAddress);

  if (!isSupportedServiceArea(officialAddress)) {
    return buildUnavailableResponse("out_of_range", officialAddress);
  }

  const resolvedRule = await resolveDeliveryRuleForAddress(officialAddress);
  const area = resolvedRule.deliveryArea;

  const validatedAddress = {
    ...officialAddress,
    deliveryAreaId: area.id,
    city: normalizeText(officialAddress.city || SERVICE_AREA.city),
    state: normalizeText(officialAddress.state || SERVICE_AREA.state).toUpperCase()
  };

  if (resolvedRule.status === "blocked" || resolvedRule.status === "pickup_only") {
    return buildUnavailableResponse(resolvedRule.status, validatedAddress, area, {
      distanceKm: resolvedRule.distanceKm,
      routeDistanceKm: resolvedRule.routeDistanceKm,
      locationPrecision: resolvedRule.locationPrecision,
      geocoderSource: resolvedRule.geocoderSource
    });
  }

  const activeFee = Number(resolvedRule.fee || area.fee || 0);
  if (!ACTIVE_DELIVERY_FEE_VALUES.includes(activeFee)) {
    throw createError(
      "delivery_area_invalid_policy",
      "Esta região ainda não está configurada corretamente para entrega. Escolha retirada no local ou fale com a loja.",
      409
    );
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + QUOTE_TTL_MS;
  const addressKey = buildDeliveryAddressKey(validatedAddress);
  const quotePayload = {
    code: buildQuoteCode(addressKey, issuedAt),
    fee: activeFee,
    zone: normalizeText(resolvedRule.zone || area.zoneId),
    zoneLabel: normalizeText(resolvedRule.zoneLabel || buildZoneLabelForArea(area)),
    distanceKm: Number(resolvedRule.distanceKm || 0),
    routeDistanceKm: Number(resolvedRule.routeDistanceKm || 0),
    locationPrecision: normalizeText(resolvedRule.locationPrecision || DELIVERY_METADATA.locationPrecision || "manual_zone"),
    geocoderSource: normalizeText(resolvedRule.geocoderSource || DELIVERY_METADATA.geocoderSource || "manual_zone_registry"),
    addressKey,
    issuedAt,
    expiresAt,
    deliveryAreaId: area.id,
    deliveryAreaName: area.name,
    deliveryAreaUpdatedAt: normalizeText(area.updatedAt),
    deliveryAreaStatus: area.status,
    deliveryZoneId: normalizeText(area.zoneId || resolvedRule.zone),
    validationMode: normalizeText(resolvedRule.validationMode || "manual_area")
  };

  return {
    status: "ready",
    fee: activeFee,
    zone: quotePayload.zone,
    zoneLabel: quotePayload.zoneLabel,
    distanceKm: quotePayload.distanceKm,
    routeDistanceKm: quotePayload.routeDistanceKm,
    locationPrecision: quotePayload.locationPrecision,
    geocoderSource: quotePayload.geocoderSource,
    distanceLabel: quotePayload.zoneLabel,
    message: getDeliveryMessageForStatus("active", activeFee),
    address: validatedAddress,
    deliveryArea: {
      id: area.id,
      name: area.name,
      status: area.status,
      zoneId: area.zoneId,
      zoneLabel: area.zoneLabel,
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
  normalizeAddress,
  isSupportedServiceArea,
  normalizeAddressToken,
  normalizeCompareText,
  normalizeText,
  sanitizeSubmittedAddress,
  assertSubmittedAddress,
  verifyQuoteToken
};
