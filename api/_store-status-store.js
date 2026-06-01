const fs = require("fs");
const path = require("path");

const STORE_STATUS_FILE_ENV_KEY = "STORE_STATUS_FILE_PATH";
const STORE_STATUS_BLOB_PATH_ENV_KEY = "STORE_STATUS_BLOB_PATHNAME";
const STORE_STATUS_STORAGE_MODE_ENV_KEY = "STORE_STATUS_STORAGE_MODE";
const DEFAULT_BLOB_PATHNAME = "config/galaxy-burger/store-status.json";
const STORE_STATUS_STATE_VERSION = 1;
const STORE_STATUS_OVERRIDE_VALUES = Object.freeze(["auto", "force_open", "force_closed"]);

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCompareText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeStoreStatusOverrideMode(value) {
  const normalizedMode = normalizeCompareText(value).replace(/[\s-]+/g, "_");
  return STORE_STATUS_OVERRIDE_VALUES.includes(normalizedMode) ? normalizedMode : "";
}

function isVercelRuntime() {
  return String(process.env.VERCEL || "") === "1" || Boolean(process.env.VERCEL_ENV);
}

function hasBlobStorageConfigured() {
  return Boolean(normalizeText(process.env.BLOB_READ_WRITE_TOKEN));
}

function resolvePreferredStoreStatusStorageMode() {
  const explicitMode = normalizeCompareText(process.env[STORE_STATUS_STORAGE_MODE_ENV_KEY]).replace(/\s+/g, "_");

  if (["file", "blob"].includes(explicitMode)) {
    return explicitMode;
  }

  if (hasBlobStorageConfigured()) {
    return "blob";
  }

  return isVercelRuntime() ? "readonly" : "file";
}

function createStoreStatusStorageError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
}

function resolveStoreStatusFilePath() {
  const configuredPath = normalizeText(process.env[STORE_STATUS_FILE_ENV_KEY]);
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(process.cwd(), "data", "store-status.json");
}

function resolveStoreStatusBlobPathname() {
  return normalizeText(process.env[STORE_STATUS_BLOB_PATH_ENV_KEY]) || DEFAULT_BLOB_PATHNAME;
}

function buildDefaultStoreStatusState(now = new Date().toISOString()) {
  return {
    version: STORE_STATUS_STATE_VERSION,
    updatedAt: now,
    overrideMode: "auto"
  };
}

function ensureStoreStatusStateShape(rawState) {
  const fallbackState = buildDefaultStoreStatusState();
  const normalizedOverrideMode = normalizeStoreStatusOverrideMode(rawState?.overrideMode) || "auto";
  const state = rawState && typeof rawState === "object"
    ? {
        version: Number(rawState.version) || STORE_STATUS_STATE_VERSION,
        updatedAt: normalizeText(rawState.updatedAt) || fallbackState.updatedAt,
        overrideMode: normalizedOverrideMode
      }
    : fallbackState;

  const didChange = !rawState
    || Number(rawState.version) !== state.version
    || normalizeText(rawState.updatedAt) !== state.updatedAt
    || normalizeStoreStatusOverrideMode(rawState.overrideMode) !== state.overrideMode;

  return {
    state,
    didChange
  };
}

async function getBlobSdk() {
  if (!hasBlobStorageConfigured()) {
    return null;
  }

  try {
    return require("@vercel/blob");
  } catch {
    throw createStoreStatusStorageError(
      "store_status_blob_sdk_missing",
      "O controle persistente de abertura da loja ainda nao foi concluido no projeto. Instale a dependencia e publique novamente.",
      500
    );
  }
}

function buildStoreStatusStorageMeta(storageMode, persistenceConfigured = true) {
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

async function persistStoreStatusStateToBlob(state) {
  const blobSdk = await getBlobSdk();
  const serialized = `${JSON.stringify(state, null, 2)}\n`;

  await blobSdk.put(resolveStoreStatusBlobPathname(), serialized, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

async function readStoreStatusStateFromBlob() {
  const blobSdk = await getBlobSdk();
  const result = await blobSdk.get(resolveStoreStatusBlobPathname(), {
    access: "private"
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    const initialState = buildDefaultStoreStatusState();
    await persistStoreStatusStateToBlob(initialState);

    return {
      state: initialState,
      ...buildStoreStatusStorageMeta("blob", true)
    };
  }

  const rawContent = await new Response(result.stream).text();
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureStoreStatusStateShape(parsedContent);

  if (didChange) {
    await persistStoreStatusStateToBlob(state);
  }

  return {
    state,
    ...buildStoreStatusStorageMeta("blob", true)
  };
}

function persistStoreStatusStateToFile(state) {
  const filePath = resolveStoreStatusFilePath();
  const directoryPath = path.dirname(filePath);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readStoreStatusStateFromFile() {
  const filePath = resolveStoreStatusFilePath();

  if (!fs.existsSync(filePath)) {
    const initialState = buildDefaultStoreStatusState();
    persistStoreStatusStateToFile(initialState);

    return {
      state: initialState,
      ...buildStoreStatusStorageMeta("file", true)
    };
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureStoreStatusStateShape(parsedContent);

  if (didChange) {
    persistStoreStatusStateToFile(state);
  }

  return {
    state,
    ...buildStoreStatusStorageMeta("file", true)
  };
}

async function readStoreStatusState() {
  const storageMode = resolvePreferredStoreStatusStorageMode();

  if (storageMode === "blob") {
    return readStoreStatusStateFromBlob();
  }

  if (storageMode === "readonly") {
    return {
      state: ensureStoreStatusStateShape(null).state,
      ...buildStoreStatusStorageMeta("readonly", false)
    };
  }

  return readStoreStatusStateFromFile();
}

async function getStoreStatusSnapshot() {
  const storeStatusResult = await readStoreStatusState();
  const state = storeStatusResult.state;

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    overrideMode: state.overrideMode,
    storageMode: storeStatusResult.storageMode,
    persistenceConfigured: storeStatusResult.persistenceConfigured,
    storageLabel: storeStatusResult.storageLabel
  };
}

async function persistStoreStatusState(state, storageMode = resolvePreferredStoreStatusStorageMode()) {
  if (storageMode === "blob") {
    await persistStoreStatusStateToBlob(state);
    return;
  }

  if (storageMode === "readonly") {
    throw createStoreStatusStorageError(
      "store_status_storage_not_configured",
      "O controle persistente de abertura da loja ainda nao foi configurado para producao. Conecte um Vercel Blob ao projeto para salvar as mudancas automaticamente.",
      503
    );
  }

  persistStoreStatusStateToFile(state);
}

async function updateStoreStatusOverride(overrideMode) {
  const normalizedOverrideMode = normalizeStoreStatusOverrideMode(overrideMode);

  if (!normalizedOverrideMode) {
    throw createStoreStatusStorageError(
      "invalid_store_status_override_mode",
      "Escolha um modo valido para o status da loja.",
      422
    );
  }

  const storeStatusResult = await readStoreStatusState();
  if (!storeStatusResult.persistenceConfigured) {
    throw createStoreStatusStorageError(
      "store_status_storage_not_configured",
      "O controle persistente de abertura da loja ainda nao foi configurado para producao. Conecte um Vercel Blob ao projeto para salvar as mudancas automaticamente.",
      503
    );
  }

  const state = storeStatusResult.state;
  state.overrideMode = normalizedOverrideMode;
  state.updatedAt = new Date().toISOString();

  await persistStoreStatusState(state, storeStatusResult.storageMode);
  return getStoreStatusSnapshot();
}

module.exports = {
  STORE_STATUS_OVERRIDE_VALUES,
  buildDefaultStoreStatusState,
  createStoreStatusStorageError,
  getStoreStatusSnapshot,
  normalizeStoreStatusOverrideMode,
  updateStoreStatusOverride
};
