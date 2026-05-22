const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const deliveryConfig = require("../delivery-config");

const DELIVERY_AREAS_FILE_ENV_KEY = "DELIVERY_AREAS_FILE_PATH";
const DELIVERY_AREAS_BLOB_PATH_ENV_KEY = "DELIVERY_AREAS_BLOB_PATHNAME";
const DELIVERY_AREAS_STORAGE_MODE_ENV_KEY = "DELIVERY_AREAS_STORAGE_MODE";
const DEFAULT_BLOB_PATHNAME = "config/galaxy-burger/delivery-areas.json";
const DELIVERY_AREAS_STATE_VERSION = 1;
const DELIVERY_AREA_STATUS_VALUES = new Set(["active", "blocked", "pickup_only"]);
const DEFAULT_ACTIVE_NOTE = "Entrega liberada para este bairro.";
const DEFAULT_BLOCKED_NOTE = "Bairro bloqueado para entrega.";
const DEFAULT_PICKUP_ONLY_NOTE = "Atendimento apenas com retirada no local.";
const DELIVERY_NORMALIZATION_ABBREVIATIONS = Object.freeze(
  Object.entries(deliveryConfig.normalization?.abbreviations || {})
);

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

function createDeliveryAreaStorageError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
}

function isVercelRuntime() {
  return String(process.env.VERCEL || "") === "1" || Boolean(process.env.VERCEL_ENV);
}

function hasBlobStorageConfigured() {
  return Boolean(normalizeText(process.env.BLOB_READ_WRITE_TOKEN));
}

function resolvePreferredDeliveryAreasStorageMode() {
  const explicitMode = normalizeCompareText(process.env[DELIVERY_AREAS_STORAGE_MODE_ENV_KEY]).replace(/\s+/g, "_");

  if (["file", "blob"].includes(explicitMode)) {
    return explicitMode;
  }

  if (hasBlobStorageConfigured()) {
    return "blob";
  }

  return isVercelRuntime() ? "readonly" : "file";
}

function resolveDeliveryAreasFilePath() {
  const configuredPath = normalizeText(process.env[DELIVERY_AREAS_FILE_ENV_KEY]);
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(process.cwd(), "data", "delivery-areas.json");
}

function resolveDeliveryAreasBlobPathname() {
  return normalizeText(process.env[DELIVERY_AREAS_BLOB_PATH_ENV_KEY]) || DEFAULT_BLOB_PATHNAME;
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

function buildDefaultNoteForStatus(status) {
  if (status === "blocked") return DEFAULT_BLOCKED_NOTE;
  if (status === "pickup_only") return DEFAULT_PICKUP_ONLY_NOTE;
  return DEFAULT_ACTIVE_NOTE;
}

function createSeedDeliveryArea({ name, fee, status, note = "" }, updatedAt) {
  const normalizedName = normalizeDeliveryAreaName(name);
  if (!normalizedName) {
    return null;
  }

  const normalizedStatus = normalizeDeliveryAreaStatus(status);
  const normalizedFee = Math.max(0, Number.isFinite(Number(fee)) ? Number(fee) : 0);

  return {
    id: buildDeliveryAreaId(),
    name: toTitleCase(normalizedName),
    normalizedName,
    fee: normalizedFee,
    status: normalizedStatus,
    note: normalizeText(note) || buildDefaultNoteForStatus(normalizedStatus),
    createdAt: updatedAt,
    updatedAt
  };
}

function buildDefaultDeliveryAreasState(now = new Date().toISOString()) {
  const areasByNormalizedName = new Map();
  const zones = Array.isArray(deliveryConfig.zones) ? deliveryConfig.zones : [];
  const blockedRules = Array.isArray(deliveryConfig.blockedRules) ? deliveryConfig.blockedRules : [];

  zones.forEach(zone => {
    const fee = Math.max(0, Number(zone?.fee || 0));
    const neighborhoods = Array.isArray(zone?.neighborhoods) ? zone.neighborhoods : [];

    neighborhoods.forEach(neighborhood => {
      const area = createSeedDeliveryArea({
        name: neighborhood,
        fee,
        status: "active",
        note: zone?.label || DEFAULT_ACTIVE_NOTE
      }, now);

      if (area && !areasByNormalizedName.has(area.normalizedName)) {
        areasByNormalizedName.set(area.normalizedName, area);
      }
    });
  });

  blockedRules.forEach(rule => {
    const neighborhoods = Array.isArray(rule?.neighborhoods) ? rule.neighborhoods : [];

    neighborhoods.forEach(neighborhood => {
      const area = createSeedDeliveryArea({
        name: neighborhood,
        fee: 0,
        status: "blocked",
        note: normalizeText(rule?.name) || DEFAULT_BLOCKED_NOTE
      }, now);

      if (!area) {
        return;
      }

      areasByNormalizedName.set(area.normalizedName, area);
    });
  });

  const areas = Array.from(areasByNormalizedName.values())
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  return {
    version: DELIVERY_AREAS_STATE_VERSION,
    updatedAt: now,
    areas
  };
}

function sanitizeDeliveryAreaRecord(area, existingAreas = [], options = {}) {
  const normalizedId = normalizeText(area?.id || options.fallbackId || "");
  const name = normalizeText(area?.name);
  const normalizedName = normalizeDeliveryAreaName(name);
  const status = normalizeDeliveryAreaStatus(area?.status);
  const note = normalizeText(area?.note);
  const fee = normalizeMoneyValue(area?.fee);
  const createdAt = normalizeText(area?.createdAt || options.createdAt || "");
  const updatedAt = normalizeText(area?.updatedAt || options.updatedAt || "");

  if (!normalizedName) {
    throw createDeliveryAreaStorageError("delivery_area_name_required", "Informe o nome do bairro.", 422);
  }

  if (!Number.isFinite(fee) || fee < 0) {
    throw createDeliveryAreaStorageError("delivery_area_invalid_fee", "Informe uma taxa valida para o bairro.", 422);
  }

  const duplicatedArea = existingAreas.find(candidate =>
    normalizeText(candidate?.id) !== normalizedId
    && normalizeDeliveryAreaName(candidate?.normalizedName || candidate?.name) === normalizedName
  );

  if (duplicatedArea) {
    throw createDeliveryAreaStorageError(
      "delivery_area_duplicate_name",
      "Ja existe um bairro cadastrado com esse nome.",
      409
    );
  }

  return {
    id: normalizedId || buildDeliveryAreaId(),
    name,
    normalizedName,
    fee: Number(fee.toFixed(2)),
    status,
    note: note || buildDefaultNoteForStatus(status),
    createdAt: createdAt || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString()
  };
}

function ensureDeliveryAreasStateShape(rawState) {
  const fallbackState = buildDefaultDeliveryAreasState();
  const state = rawState && typeof rawState === "object"
    ? {
        version: Number(rawState.version) || DELIVERY_AREAS_STATE_VERSION,
        updatedAt: normalizeText(rawState.updatedAt) || fallbackState.updatedAt,
        areas: Array.isArray(rawState.areas) ? rawState.areas.slice() : []
      }
    : fallbackState;

  const sanitizedAreas = [];
  let didChange = false;

  state.areas.forEach((area, index) => {
    try {
      const sanitizedArea = sanitizeDeliveryAreaRecord(area, sanitizedAreas, {
        fallbackId: normalizeText(area?.id) || `legacy_area_${index + 1}`,
        createdAt: normalizeText(area?.createdAt) || state.updatedAt,
        updatedAt: normalizeText(area?.updatedAt) || state.updatedAt
      });

      if (
        normalizedIdChanged(area, sanitizedArea)
        || normalizeText(area?.name) !== sanitizedArea.name
        || normalizeDeliveryAreaName(area?.normalizedName || area?.name) !== sanitizedArea.normalizedName
        || Number(area?.fee) !== sanitizedArea.fee
        || normalizeDeliveryAreaStatus(area?.status) !== sanitizedArea.status
        || normalizeText(area?.note) !== sanitizedArea.note
      ) {
        didChange = true;
      }

      sanitizedAreas.push(sanitizedArea);
    } catch {
      didChange = true;
    }
  });

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
      version: state.version,
      updatedAt: normalizeText(state.updatedAt) || fallbackState.updatedAt,
      areas: sortedAreas
    },
    didChange
  };
}

function normalizedIdChanged(left, right) {
  return normalizeText(left?.id) !== normalizeText(right?.id);
}

async function getBlobSdk() {
  if (!hasBlobStorageConfigured()) {
    return null;
  }

  try {
    return require("@vercel/blob");
  } catch {
    throw createDeliveryAreaStorageError(
      "delivery_area_blob_sdk_missing",
      "A persistencia dos bairros ainda nao foi concluida no projeto. Instale a dependencia do Vercel Blob e publique novamente.",
      500
    );
  }
}

function buildDeliveryAreasStorageMeta(storageMode, persistenceConfigured = true) {
  const friendlyLabels = {
    blob: "Vercel Blob",
    file: "arquivo local",
    readonly: "somente leitura"
  };

  return {
    storageMode,
    persistenceConfigured,
    storageLabel: friendlyLabels[storageMode] || storageMode
  };
}

async function persistDeliveryAreasStateToBlob(state) {
  const blobSdk = await getBlobSdk();
  const serialized = `${JSON.stringify(state, null, 2)}\n`;

  await blobSdk.put(resolveDeliveryAreasBlobPathname(), serialized, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

async function readDeliveryAreasStateFromBlob() {
  const blobSdk = await getBlobSdk();
  const result = await blobSdk.get(resolveDeliveryAreasBlobPathname(), {
    access: "private"
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    const initialState = buildDefaultDeliveryAreasState();
    await persistDeliveryAreasStateToBlob(initialState);

    return {
      state: initialState,
      ...buildDeliveryAreasStorageMeta("blob", true)
    };
  }

  const rawContent = await new Response(result.stream).text();
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureDeliveryAreasStateShape(parsedContent);

  if (didChange) {
    await persistDeliveryAreasStateToBlob(state);
  }

  return {
    state,
    ...buildDeliveryAreasStorageMeta("blob", true)
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

async function readDeliveryAreasState() {
  const storageMode = resolvePreferredDeliveryAreasStorageMode();

  if (storageMode === "blob") {
    return readDeliveryAreasStateFromBlob();
  }

  if (storageMode === "readonly") {
    return {
      state: ensureDeliveryAreasStateShape(null).state,
      ...buildDeliveryAreasStorageMeta("readonly", false)
    };
  }

  return readDeliveryAreasStateFromFile();
}

async function persistDeliveryAreasState(state, storageMode = resolvePreferredDeliveryAreasStorageMode()) {
  if (storageMode === "blob") {
    await persistDeliveryAreasStateToBlob(state);
    return;
  }

  if (storageMode === "readonly") {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As areas de entrega ainda nao foram configuradas com armazenamento persistente em producao.",
      503
    );
  }

  persistDeliveryAreasStateToFile(state);
}

async function getDeliveryAreasSnapshot() {
  const storageResult = await readDeliveryAreasState();
  const state = storageResult.state;

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    storageMode: storageResult.storageMode,
    persistenceConfigured: storageResult.persistenceConfigured,
    storageLabel: storageResult.storageLabel,
    areas: state.areas.slice()
  };
}

function getDeliveryAreaCounts(snapshot) {
  const areas = Array.isArray(snapshot?.areas) ? snapshot.areas : [];

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
      "As areas de entrega ainda nao foram configuradas com armazenamento persistente em producao.",
      503
    );
  }

  const now = new Date().toISOString();
  const nextArea = sanitizeDeliveryAreaRecord(input, storageResult.state.areas, {
    createdAt: now,
    updatedAt: now
  });
  const nextState = {
    ...storageResult.state,
    updatedAt: now,
    areas: storageResult.state.areas.concat(nextArea).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
  return nextArea;
}

async function updateDeliveryArea(areaId, input) {
  const normalizedId = normalizeText(areaId);
  if (!normalizedId) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Bairro nao encontrado para atualizacao.", 404);
  }

  const storageResult = await readDeliveryAreasState();
  if (!storageResult.persistenceConfigured) {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As areas de entrega ainda nao foram configuradas com armazenamento persistente em producao.",
      503
    );
  }

  const areaIndex = storageResult.state.areas.findIndex(area => normalizeText(area.id) === normalizedId);
  if (areaIndex < 0) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Bairro nao encontrado para atualizacao.", 404);
  }

  const currentArea = storageResult.state.areas[areaIndex];
  const now = new Date().toISOString();
  const nextArea = sanitizeDeliveryAreaRecord({
    ...currentArea,
    ...input,
    id: normalizedId
  }, storageResult.state.areas, {
    createdAt: currentArea.createdAt,
    updatedAt: now
  });

  const nextAreas = storageResult.state.areas.slice();
  nextAreas[areaIndex] = nextArea;

  const nextState = {
    ...storageResult.state,
    updatedAt: now,
    areas: nextAreas.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
  return nextArea;
}

async function deleteDeliveryArea(areaId) {
  const normalizedId = normalizeText(areaId);
  if (!normalizedId) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Bairro nao encontrado para exclusao.", 404);
  }

  const storageResult = await readDeliveryAreasState();
  if (!storageResult.persistenceConfigured) {
    throw createDeliveryAreaStorageError(
      "delivery_areas_storage_not_configured",
      "As areas de entrega ainda nao foram configuradas com armazenamento persistente em producao.",
      503
    );
  }

  const nextAreas = storageResult.state.areas.filter(area => normalizeText(area.id) !== normalizedId);
  if (nextAreas.length === storageResult.state.areas.length) {
    throw createDeliveryAreaStorageError("delivery_area_not_found", "Bairro nao encontrado para exclusao.", 404);
  }

  const nextState = {
    ...storageResult.state,
    updatedAt: new Date().toISOString(),
    areas: nextAreas
  };

  await persistDeliveryAreasState(nextState, storageResult.storageMode);
}

module.exports = {
  DELIVERY_AREAS_BLOB_PATH_ENV_KEY,
  DELIVERY_AREAS_FILE_ENV_KEY,
  DELIVERY_AREAS_STORAGE_MODE_ENV_KEY,
  DELIVERY_AREA_STATUS_VALUES,
  buildDefaultDeliveryAreasState,
  createDeliveryArea,
  createDeliveryAreaStorageError,
  deleteDeliveryArea,
  getDeliveryAreaById,
  getDeliveryAreaByName,
  getDeliveryAreaCounts,
  getDeliveryAreasSnapshot,
  hasBlobStorageConfigured,
  normalizeDeliveryAreaName,
  normalizeDeliveryAreaStatus,
  readDeliveryAreasState,
  resolveDeliveryAreasBlobPathname,
  resolveDeliveryAreasFilePath,
  resolvePreferredDeliveryAreasStorageMode,
  updateDeliveryArea
};
