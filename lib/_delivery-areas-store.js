const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const deliveryConfig = require("../delivery-config");
const { isKvStorageConfigured, kvGetJSON, kvSetJSON } = require("./_kv-storage");

const DELIVERY_AREAS_FILE_ENV_KEY = "DELIVERY_AREAS_FILE_PATH";
const DELIVERY_AREAS_STORAGE_MODE_ENV_KEY = "DELIVERY_AREAS_STORAGE_MODE";
const DELIVERY_AREAS_KV_KEY = "hamburgeria:delivery-areas";
const DELIVERY_AREAS_STATE_VERSION = 3;
const DELIVERY_AREA_STATUS_VALUES = new Set(["active", "blocked", "pickup_only"]);
const ACTIVE_DELIVERY_FEE_VALUES = Object.freeze([5, 10]);
const DEFAULT_ACTIVE_NOTE = "Entrega liberada para esta região.";
const DEFAULT_BLOCKED_NOTE = "Região bloqueada para entrega.";
const DEFAULT_PICKUP_ONLY_NOTE = "Atendimento apenas com retirada no local.";
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(deliveryConfig.normalization?.abbreviations || {})
);
const DELIVERY_ZONE_IDS = Object.freeze({
  zone5: "zone_5",
  zone10: "zone_10",
  pickupOnly: "pickup_only",
  blocked: "blocked"
});
const FIXED_DELIVERY_ZONES = Object.freeze([
  Object.freeze({
    id: DELIVERY_ZONE_IDS.zone5,
    name: "Até 2,9 km",
    fee: 5,
    status: "active",
    minDistanceKm: 0,
    maxDistanceKm: 2.9,
    label: "Até 2,9 km - R$ 5,00"
  }),
  Object.freeze({
    id: DELIVERY_ZONE_IDS.zone10,
    name: "De 3 km até 5 km",
    fee: 10,
    status: "active",
    minDistanceKm: 3,
    maxDistanceKm: 5,
    label: "De 3 km até 5 km - R$ 10,00"
  }),
  Object.freeze({
    id: DELIVERY_ZONE_IDS.pickupOnly,
    name: "A partir de 5,1 km",
    fee: 0,
    status: "pickup_only",
    minDistanceKm: 5.1,
    maxDistanceKm: 0,
    label: "A partir de 5,1 km - somente retirada"
  }),
  Object.freeze({
    id: DELIVERY_ZONE_IDS.blocked,
    name: "Bloqueado",
    fee: 0,
    status: "blocked",
    minDistanceKm: 0,
    maxDistanceKm: 0,
    label: "Entrega bloqueada para esta região"
  })
]);
const DELIVERY_ZONE_ALIAS_MAP = Object.freeze({
  [DELIVERY_ZONE_IDS.zone5]: DELIVERY_ZONE_IDS.zone5,
  local: DELIVERY_ZONE_IDS.zone5,
  "5": DELIVERY_ZONE_IDS.zone5,
  "r$5": DELIVERY_ZONE_IDS.zone5,
  [DELIVERY_ZONE_IDS.zone10]: DELIVERY_ZONE_IDS.zone10,
  extended: DELIVERY_ZONE_IDS.zone10,
  intermediaria: DELIVERY_ZONE_IDS.zone10,
  intermediario: DELIVERY_ZONE_IDS.zone10,
  "10": DELIVERY_ZONE_IDS.zone10,
  "r$10": DELIVERY_ZONE_IDS.zone10,
  [DELIVERY_ZONE_IDS.pickupOnly]: DELIVERY_ZONE_IDS.pickupOnly,
  pickup: DELIVERY_ZONE_IDS.pickupOnly,
  retirada: DELIVERY_ZONE_IDS.pickupOnly,
  somente_retirada: DELIVERY_ZONE_IDS.pickupOnly,
  [DELIVERY_ZONE_IDS.blocked]: DELIVERY_ZONE_IDS.blocked,
  bloqueado: DELIVERY_ZONE_IDS.blocked,
  blocked: DELIVERY_ZONE_IDS.blocked
});

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCompareText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function applyAreaAbbreviations(value) {
  return DELIVERY_NORMALIZATION_ABBREVIATIONS.reduce((normalizedValue, [alias, replacement]) =>
    normalizedValue.replace(new RegExp(`\\b${alias}\\b`, "g"), replacement),
  value);
}

function normalizeDeliveryAreaName(value) {
  return applyAreaAbbreviations(normalizeCompareText(value))
    .replace(/[.,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DELIVERY_DISPLAY_TEXT_REPLACEMENTS = Object.freeze([
  ["Ate 2,9 km", "Até 2,9 km"],
  ["Ate 2,9 km - R$ 5,00", "Até 2,9 km - R$ 5,00"],
  ["Ate 2,9 km da base - R$ 5,00", "Até 2,9 km da base - R$ 5,00"],
  ["De 3 km ate 5 km", "De 3 km até 5 km"],
  ["De 3 km ate 5 km - R$ 10,00", "De 3 km até 5 km - R$ 10,00"],
  ["De 3 km ate 5 km da base - R$ 10,00", "De 3 km até 5 km da base - R$ 10,00"],
  ["Regiao fora da area", "Região fora da área"],
  ["Regiao bloqueada para entrega.", "Região bloqueada para entrega."],
  ["Entrega bloqueada para esta regiao", "Entrega bloqueada para esta região"],
  ["Entrega liberada para esta regiao.", "Entrega liberada para esta região."]
]);

function formatDeliveryDisplayText(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const replacement = DELIVERY_DISPLAY_TEXT_REPLACEMENTS.find(([source]) => source === text);
  return replacement ? replacement[1] : text;
}

function normalizeDeliveryAreaStatus(value) {
  const normalizedStatus = normalizeCompareText(value).replace(/[\s-]+/g, "_");
  return DELIVERY_AREA_STATUS_VALUES.has(normalizedStatus) ? normalizedStatus : "active";
}

function normalizeMoneyValue(value) {
  if (typeof value === "string") {
    const compactValue = value.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
    const parsedStringValue = Number(compactValue);
    return Number.isFinite(parsedStringValue) ? parsedStringValue : NaN;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
}

function normalizeDeliveryZoneId(value) {
  const normalizedZoneId = normalizeCompareText(value).replace(/[\s-]+/g, "_");
  return DELIVERY_ZONE_ALIAS_MAP[normalizedZoneId] || "";
}

function createDeliveryAreaStorageError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
}

function createInvalidActiveFeePolicyError() {
  return createDeliveryAreaStorageError(
    "delivery_area_invalid_fee_policy",
    "Regiões com entrega ativa devem usar taxa de R$ 5,00 ou R$ 10,00.",
    422
  );
}

function isVercelRuntime() {
  return String(process.env.VERCEL || "") === "1" || Boolean(process.env.VERCEL_ENV);
}

function resolvePreferredDeliveryAreasStorageMode() {
  const explicitMode = normalizeCompareText(process.env[DELIVERY_AREAS_STORAGE_MODE_ENV_KEY]).replace(/\s+/g, "_");

  if (explicitMode === "file" || explicitMode === "kv") {
    return explicitMode;
  }

  if (isVercelRuntime()) {
    return isKvStorageConfigured() ? "kv" : "readonly";
  }

  return "file";
}

function resolveDeliveryAreasFilePath() {
  const configuredPath = normalizeText(process.env[DELIVERY_AREAS_FILE_ENV_KEY]);
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(process.cwd(), "data", "delivery-areas.json");
}

function buildDeliveryAreaId() {
  return `area_${randomBytes(6).toString("hex")}`;
}

function toTitleCase(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDefaultNoteForZone(zoneId) {
  if (zoneId === DELIVERY_ZONE_IDS.blocked) return DEFAULT_BLOCKED_NOTE;
  if (zoneId === DELIVERY_ZONE_IDS.pickupOnly) return DEFAULT_PICKUP_ONLY_NOTE;
  return DEFAULT_ACTIVE_NOTE;
}

function cloneFixedDeliveryZones(updatedAt = new Date().toISOString()) {
  return FIXED_DELIVERY_ZONES.map(zone => ({
    ...zone,
    createdAt: updatedAt,
    updatedAt
  }));
}

function createDeliveryZoneMap(zones = []) {
  const sourceZones = Array.isArray(zones) && zones.length ? zones : cloneFixedDeliveryZones();

  return new Map(
    sourceZones
      .map(zone => ({
        ...zone,
        id: normalizeDeliveryZoneId(zone?.id) || ""
      }))
      .filter(zone => zone.id)
      .map(zone => [zone.id, zone])
  );
}

function resolveDeliveryZoneIdFromLegacy(input = {}, { strict = true } = {}) {
  const explicitZoneId = normalizeDeliveryZoneId(input.zoneId || input.zone || input.deliveryZoneId);
  if (explicitZoneId) {
    return explicitZoneId;
  }

  const status = normalizeDeliveryAreaStatus(input.status);
  if (status === "blocked") {
    return DELIVERY_ZONE_IDS.blocked;
  }
  if (status === "pickup_only") {
    return DELIVERY_ZONE_IDS.pickupOnly;
  }

  const fee = normalizeMoneyValue(input.fee);
  const roundedFee = Number(Number.isFinite(fee) ? fee.toFixed(2) : 0);

  if (!Number.isFinite(fee) || roundedFee <= 0) {
    return DELIVERY_ZONE_IDS.zone5;
  }

  if (!ACTIVE_DELIVERY_FEE_VALUES.includes(roundedFee)) {
    if (strict) {
      throw createInvalidActiveFeePolicyError();
    }

    return roundedFee > 5 ? DELIVERY_ZONE_IDS.zone10 : DELIVERY_ZONE_IDS.zone5;
  }

  return roundedFee === 10 ? DELIVERY_ZONE_IDS.zone10 : DELIVERY_ZONE_IDS.zone5;
}

function resolveDeliveryZoneById(zoneId, zones = []) {
  const normalizedZoneId = normalizeDeliveryZoneId(zoneId);
  const zoneMap = createDeliveryZoneMap(zones);
  return zoneMap.get(normalizedZoneId) || zoneMap.get(DELIVERY_ZONE_IDS.zone5) || cloneFixedDeliveryZones()[0];
}

function createSeedDeliveryArea({ name, zoneId, note = "" }, updatedAt) {
  const normalizedName = normalizeDeliveryAreaName(name);
  if (!normalizedName) {
    return null;
  }

  const resolvedZone = resolveDeliveryZoneById(zoneId);
  return {
    id: buildDeliveryAreaId(),
    name: toTitleCase(normalizedName),
    normalizedName,
    zoneId: resolvedZone.id,
    note: normalizeText(note) || buildDefaultNoteForZone(resolvedZone.id),
    createdAt: updatedAt,
    updatedAt
  };
}

function registerSeedDeliveryArea(collection, entry, now) {
  const area = createSeedDeliveryArea(entry, now);

  if (area && !collection.has(area.normalizedName)) {
    collection.set(area.normalizedName, area);
  }
}

function buildDefaultDeliveryAreasState(now = new Date().toISOString()) {
  const areasByNormalizedName = new Map();
  const configZones = Array.isArray(deliveryConfig.zones) ? deliveryConfig.zones : [];
  const blockedRules = Array.isArray(deliveryConfig.blockedRules) ? deliveryConfig.blockedRules : [];
  const zones = cloneFixedDeliveryZones(now);

  configZones.forEach(zone => {
    const resolvedZoneId = resolveDeliveryZoneIdFromLegacy({
      zoneId: zone?.id || zone?.value || zone?.zoneId,
      status: zone?.status,
      fee: zone?.fee
    }, {
      strict: false
    });
    const neighborhoods = Array.isArray(zone?.neighborhoods) ? zone.neighborhoods : [];
    const streetHints = Array.isArray(zone?.streetHints) ? zone.streetHints : [];

    neighborhoods.forEach(neighborhood => {
      registerSeedDeliveryArea(areasByNormalizedName, {
        name: neighborhood,
        zoneId: resolvedZoneId,
        note: zone?.label || buildDefaultNoteForZone(resolvedZoneId)
      }, now);
    });

    streetHints.forEach(streetHint => {
      registerSeedDeliveryArea(areasByNormalizedName, {
        name: streetHint,
        zoneId: resolvedZoneId,
        note: zone?.label || buildDefaultNoteForZone(resolvedZoneId)
      }, now);
    });
  });

  blockedRules.forEach(rule => {
    const neighborhoods = Array.isArray(rule?.neighborhoods) ? rule.neighborhoods : [];
    const streetHints = Array.isArray(rule?.streetHints) ? rule.streetHints : [];

    neighborhoods.forEach(neighborhood => {
      registerSeedDeliveryArea(areasByNormalizedName, {
        name: neighborhood,
        zoneId: DELIVERY_ZONE_IDS.blocked,
        note: normalizeText(rule?.name) || DEFAULT_BLOCKED_NOTE
      }, now);
    });

    streetHints.forEach(streetHint => {
      registerSeedDeliveryArea(areasByNormalizedName, {
        name: streetHint,
        zoneId: DELIVERY_ZONE_IDS.blocked,
        note: normalizeText(rule?.name) || DEFAULT_BLOCKED_NOTE
      }, now);
    });
  });

  const areas = Array.from(areasByNormalizedName.values())
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  return {
    version: DELIVERY_AREAS_STATE_VERSION,
    updatedAt: now,
    zones,
    areas
  };
}

function mergeMissingSeedDeliveryAreas(areas, updatedAt) {
  const normalizedUpdatedAt = normalizeText(updatedAt) || new Date().toISOString();
  const fallbackState = buildDefaultDeliveryAreasState(normalizedUpdatedAt);
  const existingNormalizedNames = new Set(
    areas.map(area => normalizeDeliveryAreaName(area?.normalizedName || area?.name)).filter(Boolean)
  );
  let didAddArea = false;

  fallbackState.areas.forEach(area => {
    if (existingNormalizedNames.has(area.normalizedName)) {
      return;
    }

    areas.push({
      ...area,
      createdAt: normalizeText(area.createdAt) || normalizedUpdatedAt,
      updatedAt: normalizeText(area.updatedAt) || normalizedUpdatedAt
    });
    existingNormalizedNames.add(area.normalizedName);
    didAddArea = true;
  });

  return didAddArea;
}

function sanitizeDeliveryAreaRecord(area, existingAreas = [], options = {}) {
  const normalizedId = normalizeText(area?.id || options.fallbackId || "");
  const name = normalizeText(area?.name);
  const normalizedName = normalizeDeliveryAreaName(name);
  const createdAt = normalizeText(area?.createdAt || options.createdAt || "");
  const updatedAt = normalizeText(area?.updatedAt || options.updatedAt || "");

  if (!normalizedName) {
    throw createDeliveryAreaStorageError("delivery_area_name_required", "Informe o nome do bairro ou região.", 422);
  }

  const duplicatedArea = existingAreas.find(candidate =>
    normalizeText(candidate?.id) !== normalizedId
    && normalizeDeliveryAreaName(candidate?.normalizedName || candidate?.name) === normalizedName
  );

  if (duplicatedArea) {
    throw createDeliveryAreaStorageError(
      "delivery_area_duplicate_name",
      "Já existe um bairro ou região cadastrado com esse nome.",
      409
    );
  }

  const zoneId = resolveDeliveryZoneIdFromLegacy({
    zoneId: area?.zoneId || area?.zone || area?.deliveryZoneId,
    status: area?.status,
    fee: area?.fee
  }, {
    strict: options.strictFeePolicy !== false
  });
  const zone = resolveDeliveryZoneById(zoneId, options.zones);
  const note = normalizeText(area?.note) || buildDefaultNoteForZone(zone.id);

  return {
    id: normalizedId || buildDeliveryAreaId(),
    name: toTitleCase(normalizedName),
    normalizedName,
    zoneId: zone.id,
    note,
    createdAt: createdAt || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString()
  };
}

function resolvePublicDeliveryArea(area, zones = []) {
  const zone = resolveDeliveryZoneById(area?.zoneId, zones);

  return {
    id: normalizeText(area?.id),
    name: normalizeText(area?.name),
    normalizedName: normalizeDeliveryAreaName(area?.normalizedName || area?.name),
    zoneId: zone.id,
    zoneName: formatDeliveryDisplayText(zone.name),
    zoneLabel: formatDeliveryDisplayText(zone.label),
    minDistanceKm: Number(zone.minDistanceKm || 0),
    maxDistanceKm: Number(zone.maxDistanceKm || 0),
    fee: Number(zone.fee || 0),
    status: zone.status,
    note: formatDeliveryDisplayText(normalizeText(area?.note) || buildDefaultNoteForZone(zone.id)),
    supportsDelivery: zone.status === "active",
    pickupOnly: zone.status === "pickup_only",
    blocked: zone.status === "blocked",
    createdAt: normalizeText(area?.createdAt),
    updatedAt: normalizeText(area?.updatedAt),
    zoneUpdatedAt: normalizeText(zone.updatedAt)
  };
}

function ensureDeliveryAreasStateShape(rawState) {
  const fallbackState = buildDefaultDeliveryAreasState();
  const rawVersion = Number(rawState?.version) || 0;
  const state = rawState && typeof rawState === "object"
    ? {
        version: Number(rawState.version) || DELIVERY_AREAS_STATE_VERSION,
        updatedAt: normalizeText(rawState.updatedAt) || fallbackState.updatedAt,
        areas: Array.isArray(rawState.areas) ? rawState.areas.slice() : []
      }
    : fallbackState;
  const zones = cloneFixedDeliveryZones(state.updatedAt || fallbackState.updatedAt);
  const sanitizedAreas = [];
  let didChange = !rawState || !Array.isArray(rawState?.zones) || Number(rawState?.version) !== DELIVERY_AREAS_STATE_VERSION;

  state.areas.forEach((area, index) => {
    try {
      const sanitizedArea = sanitizeDeliveryAreaRecord(area, sanitizedAreas, {
        fallbackId: normalizeText(area?.id) || `legacy_area_${index + 1}`,
        createdAt: normalizeText(area?.createdAt) || state.updatedAt,
        updatedAt: normalizeText(area?.updatedAt) || state.updatedAt,
        strictFeePolicy: false,
        zones
      });

      if (
        normalizeText(area?.id) !== sanitizedArea.id
        || normalizeText(area?.name) !== sanitizedArea.name
        || normalizeDeliveryAreaName(area?.normalizedName || area?.name) !== sanitizedArea.normalizedName
        || normalizeDeliveryZoneId(area?.zoneId || area?.zone || area?.deliveryZoneId) !== sanitizedArea.zoneId
        || normalizeText(area?.note) !== sanitizedArea.note
      ) {
        didChange = true;
      }

      sanitizedAreas.push(sanitizedArea);
    } catch {
      didChange = true;
    }
  });

  if (rawVersion > 0 && rawVersion < DELIVERY_AREAS_STATE_VERSION) {
    if (mergeMissingSeedDeliveryAreas(sanitizedAreas, normalizeText(state.updatedAt) || fallbackState.updatedAt)) {
      didChange = true;
    }
  }

  if (!sanitizedAreas.length) {
    return {
      state: fallbackState,
      didChange: true
    };
  }

  const sortedAreas = sanitizedAreas
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  if (sortedAreas.some((area, index) => area.id !== sanitizedAreas[index]?.id)) {
    didChange = true;
  }

  return {
    state: {
      version: DELIVERY_AREAS_STATE_VERSION,
      updatedAt: normalizeText(state.updatedAt) || fallbackState.updatedAt,
      zones,
      areas: sortedAreas
    },
    didChange
  };
}

function buildDeliveryAreasStorageMeta(storageMode, persistenceConfigured = true) {
  const friendlyLabels = {
    file: "arquivo local",
    kv: "nuvem (Upstash Redis)",
    readonly: "somente leitura"
  };

  return {
    storageMode,
    persistenceConfigured,
    storageLabel: friendlyLabels[storageMode] || storageMode
  };
}

function persistDeliveryAreasStateToFile(state) {
  const filePath = resolveDeliveryAreasFilePath();
  const directoryPath = path.dirname(filePath);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readDeliveryAreasStateFromFile() {
  const filePath = resolveDeliveryAreasFilePath();

  if (!fs.existsSync(filePath)) {
    const initialState = buildDefaultDeliveryAreasState();
    persistDeliveryAreasStateToFile(initialState);

    return {
      state: initialState,
      ...buildDeliveryAreasStorageMeta("file", true)
    };
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureDeliveryAreasStateShape(parsedContent);

  if (didChange) {
    persistDeliveryAreasStateToFile(state);
  }

  return {
    state,
    ...buildDeliveryAreasStorageMeta("file", true)
  };
}

async function persistDeliveryAreasStateToKv(state) {
  await kvSetJSON(DELIVERY_AREAS_KV_KEY, state);
}

async function readDeliveryAreasStateFromKv() {
  const rawState = await kvGetJSON(DELIVERY_AREAS_KV_KEY);
  const { state, didChange } = ensureDeliveryAreasStateShape(rawState);

  if (didChange) {
    await persistDeliveryAreasStateToKv(state);
  }

  return {
    state,
    ...buildDeliveryAreasStorageMeta("kv", true)
  };
}

async function readDeliveryAreasState() {
  const storageMode = resolvePreferredDeliveryAreasStorageMode();

  if (storageMode === "readonly") {
    return {
      state: ensureDeliveryAreasStateShape(null).state,
      ...buildDeliveryAreasStorageMeta("readonly", false)
    };
  }

  if (storageMode === "kv") {
    return readDeliveryAreasStateFromKv();
  }

  return readDeliveryAreasStateFromFile();
}

async function persistDeliveryAreasState(state, storageMode = resolvePreferredDeliveryAreasStorageMode()) {
  if (storageMode === "readonly") {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As áreas de entrega estão em modo somente leitura neste ambiente.",
      503
    );
  }

  if (storageMode === "kv") {
    await persistDeliveryAreasStateToKv(state);
    return;
  }

  persistDeliveryAreasStateToFile(state);
}

async function getDeliveryAreasSnapshot() {
  const storageResult = await readDeliveryAreasState();
  const state = storageResult.state;
  const zones = cloneFixedDeliveryZones(state.updatedAt || new Date().toISOString());
  const areas = state.areas.map(area => resolvePublicDeliveryArea(area, zones));

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    storageMode: storageResult.storageMode,
    persistenceConfigured: storageResult.persistenceConfigured,
    storageLabel: storageResult.storageLabel,
    zones,
    areas
  };
}

function getDeliveryAreaCounts(snapshot) {
  const areas = Array.isArray(snapshot?.areas)
    ? snapshot.areas.map(area => ("status" in area ? area : resolvePublicDeliveryArea(area, snapshot?.zones)))
    : [];

  return areas.reduce((counts, area) => {
    counts.total += 1;

    if (area.status === "active") {
      counts.active += 1;
    } else if (area.status === "pickup_only") {
      counts.pickupOnly += 1;
    } else {
      counts.blocked += 1;
    }

    return counts;
  }, {
    total: 0,
    active: 0,
    pickupOnly: 0,
    blocked: 0
  });
}

async function getDeliveryAreaById(areaId) {
  const normalizedId = normalizeText(areaId);
  if (!normalizedId) {
    return null;
  }

  const snapshot = await getDeliveryAreasSnapshot();
  return snapshot.areas.find(area => normalizeText(area.id) === normalizedId) || null;
}

async function getDeliveryAreaByName(areaName) {
  const normalizedName = normalizeDeliveryAreaName(areaName);
  if (!normalizedName) {
    return null;
  }

  const snapshot = await getDeliveryAreasSnapshot();
  return snapshot.areas.find(area => area.normalizedName === normalizedName) || null;
}

async function createDeliveryArea(input) {
  const storageResult = await readDeliveryAreasState();
  if (!storageResult.persistenceConfigured) {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As áreas de entrega estão em modo somente leitura neste ambiente.",
      503
    );
  }

  const now = new Date().toISOString();
  const nextArea = sanitizeDeliveryAreaRecord(input, storageResult.state.areas, {
    createdAt: now,
    updatedAt: now,
    zones: storageResult.state.zones
  });
  const nextState = {
    ...storageResult.state,
    version: DELIVERY_AREAS_STATE_VERSION,
    updatedAt: now,
    zones: cloneFixedDeliveryZones(now),
    areas: storageResult.state.areas.concat(nextArea).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
  return resolvePublicDeliveryArea(nextArea, nextState.zones);
}

async function updateDeliveryArea(areaId, input) {
  const normalizedId = normalizeText(areaId);
  if (!normalizedId) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Região não encontrada para atualização.", 404);
  }

  const storageResult = await readDeliveryAreasState();
  if (!storageResult.persistenceConfigured) {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As áreas de entrega estão em modo somente leitura neste ambiente.",
      503
    );
  }

  const areaIndex = storageResult.state.areas.findIndex(area => normalizeText(area.id) === normalizedId);
  if (areaIndex < 0) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Região não encontrada para atualização.", 404);
  }

  const currentArea = storageResult.state.areas[areaIndex];
  const now = new Date().toISOString();
  const nextArea = sanitizeDeliveryAreaRecord({
    ...currentArea,
    ...input,
    id: normalizedId
  }, storageResult.state.areas, {
    createdAt: currentArea.createdAt,
    updatedAt: now,
    zones: storageResult.state.zones
  });

  const nextAreas = storageResult.state.areas.slice();
  nextAreas[areaIndex] = nextArea;

  const nextState = {
    ...storageResult.state,
    version: DELIVERY_AREAS_STATE_VERSION,
    updatedAt: now,
    zones: cloneFixedDeliveryZones(now),
    areas: nextAreas.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
  return resolvePublicDeliveryArea(nextArea, nextState.zones);
}

async function deleteDeliveryArea(areaId) {
  const normalizedId = normalizeText(areaId);
  if (!normalizedId) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Região não encontrada para exclusão.", 404);
  }

  const storageResult = await readDeliveryAreasState();
  if (!storageResult.persistenceConfigured) {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As áreas de entrega estão em modo somente leitura neste ambiente.",
      503
    );
  }

  const nextAreas = storageResult.state.areas.filter(area => normalizeText(area.id) !== normalizedId);
  if (nextAreas.length === storageResult.state.areas.length) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Região não encontrada para exclusão.", 404);
  }

  const nextState = {
    ...storageResult.state,
    version: DELIVERY_AREAS_STATE_VERSION,
    updatedAt: new Date().toISOString(),
    zones: cloneFixedDeliveryZones(new Date().toISOString()),
    areas: nextAreas
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
}

module.exports = {
  DELIVERY_AREAS_FILE_ENV_KEY,
  DELIVERY_AREAS_STORAGE_MODE_ENV_KEY,
  DELIVERY_AREA_STATUS_VALUES,
  DELIVERY_ZONE_IDS,
  ACTIVE_DELIVERY_FEE_VALUES,
  FIXED_DELIVERY_ZONES,
  buildDefaultDeliveryAreasState,
  createDeliveryArea,
  createDeliveryAreaStorageError,
  deleteDeliveryArea,
  getDeliveryAreaById,
  getDeliveryAreaByName,
  getDeliveryAreaCounts,
  getDeliveryAreasSnapshot,
  normalizeDeliveryAreaName,
  normalizeDeliveryAreaStatus,
  normalizeDeliveryZoneId,
  readDeliveryAreasState,
  resolveDeliveryAreasFilePath,
  resolvePreferredDeliveryAreasStorageMode,
  resolvePublicDeliveryArea,
  updateDeliveryArea
};
