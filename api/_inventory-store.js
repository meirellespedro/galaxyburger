const fs = require("fs");
const path = require("path");
const catalogConfig = require("../catalog-config");

const INVENTORY_FILE_ENV_KEY = "INVENTORY_STATUS_FILE_PATH";
const INVENTORY_BLOB_PATH_ENV_KEY = "INVENTORY_BLOB_PATHNAME";
const INVENTORY_STORAGE_MODE_ENV_KEY = "INVENTORY_STORAGE_MODE";
const DEFAULT_BLOB_PATHNAME = "config/galaxy-burger/inventory-status.json";
const INVENTORY_STATE_VERSION = 1;
const BASE_PRODUCTS = Array.isArray(catalogConfig.products) ? catalogConfig.products : [];
const BASE_PRODUCT_MAP = new Map(
  BASE_PRODUCTS
    .filter(product => product && normalizeText(product.id))
    .map(product => [normalizeText(product.id), Object.freeze(product)])
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

function isVercelRuntime() {
  return String(process.env.VERCEL || "") === "1" || Boolean(process.env.VERCEL_ENV);
}

function hasBlobStorageConfigured() {
  return Boolean(normalizeText(process.env.BLOB_READ_WRITE_TOKEN));
}

function resolvePreferredInventoryStorageMode() {
  const explicitMode = normalizeCompareText(process.env[INVENTORY_STORAGE_MODE_ENV_KEY]).replace(/\s+/g, "_");

  if (["file", "blob"].includes(explicitMode)) {
    return explicitMode;
  }

  if (hasBlobStorageConfigured()) {
    return "blob";
  }

  return isVercelRuntime() ? "readonly" : "file";
}

function createInventoryStorageError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
}

function resolveInventoryFilePath() {
  const configuredPath = normalizeText(process.env[INVENTORY_FILE_ENV_KEY]);
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(process.cwd(), "data", "inventory-status.json");
}

function resolveInventoryBlobPathname() {
  return normalizeText(process.env[INVENTORY_BLOB_PATH_ENV_KEY]) || DEFAULT_BLOB_PATHNAME;
}

function createInventoryEntry(product, updatedAt = "") {
  return {
    available: Boolean(product?.available),
    updatedAt: normalizeText(updatedAt),
    name: normalizeText(product?.name),
    category: normalizeText(product?.category)
  };
}

function buildDefaultInventoryState(now = new Date().toISOString()) {
  const items = {};

  BASE_PRODUCTS.forEach(product => {
    const productId = normalizeText(product?.id);
    if (!productId) return;
    items[productId] = createInventoryEntry(product, now);
  });

  return {
    version: INVENTORY_STATE_VERSION,
    updatedAt: now,
    items
  };
}

function ensureInventoryStateShape(rawState) {
  const fallbackState = buildDefaultInventoryState();
  const state = rawState && typeof rawState === "object"
    ? {
        version: Number(rawState.version) || INVENTORY_STATE_VERSION,
        updatedAt: normalizeText(rawState.updatedAt) || fallbackState.updatedAt,
        items: rawState.items && typeof rawState.items === "object" ? { ...rawState.items } : {}
      }
    : fallbackState;

  let didChange = false;

  BASE_PRODUCTS.forEach(product => {
    const productId = normalizeText(product?.id);
    if (!productId) return;

    const existingEntry = state.items[productId];
    if (!existingEntry || typeof existingEntry !== "object") {
      state.items[productId] = createInventoryEntry(product, state.updatedAt);
      didChange = true;
      return;
    }

    const normalizedEntry = {
      ...createInventoryEntry(product, normalizeText(existingEntry.updatedAt) || state.updatedAt),
      available: typeof existingEntry.available === "boolean"
        ? existingEntry.available
        : Boolean(product.available)
    };

    if (
      existingEntry.available !== normalizedEntry.available
      || normalizeText(existingEntry.updatedAt) !== normalizedEntry.updatedAt
      || normalizeText(existingEntry.name) !== normalizedEntry.name
      || normalizeText(existingEntry.category) !== normalizedEntry.category
    ) {
      state.items[productId] = normalizedEntry;
      didChange = true;
    }
  });

  Object.keys(state.items).forEach(productId => {
    if (BASE_PRODUCT_MAP.has(productId)) {
      return;
    }

    delete state.items[productId];
    didChange = true;
  });

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
    throw createInventoryStorageError(
      "inventory_blob_sdk_missing",
      "O estoque persistente da Vercel Blob ainda não foi concluído no projeto. Instale a dependência e publique novamente.",
      500
    );
  }
}

function buildInventoryStorageMeta(storageMode, persistenceConfigured = true) {
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

async function persistInventoryStateToBlob(state) {
  const blobSdk = await getBlobSdk();
  const serialized = `${JSON.stringify(state, null, 2)}\n`;

  await blobSdk.put(resolveInventoryBlobPathname(), serialized, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

async function readInventoryStateFromBlob() {
  const blobSdk = await getBlobSdk();
  const result = await blobSdk.get(resolveInventoryBlobPathname(), {
    access: "private"
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    const initialState = buildDefaultInventoryState();
    await persistInventoryStateToBlob(initialState);

    return {
      state: initialState,
      ...buildInventoryStorageMeta("blob", true)
    };
  }

  const rawContent = await new Response(result.stream).text();
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureInventoryStateShape(parsedContent);

  if (didChange) {
    await persistInventoryStateToBlob(state);
  }

  return {
    state,
    ...buildInventoryStorageMeta("blob", true)
  };
}

function persistInventoryStateToFile(state) {
  const filePath = resolveInventoryFilePath();
  const directoryPath = path.dirname(filePath);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readInventoryStateFromFile() {
  const filePath = resolveInventoryFilePath();

  if (!fs.existsSync(filePath)) {
    const initialState = buildDefaultInventoryState();
    persistInventoryStateToFile(initialState);

    return {
      state: initialState,
      ...buildInventoryStorageMeta("file", true)
    };
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  const { state, didChange } = ensureInventoryStateShape(parsedContent);

  if (didChange) {
    persistInventoryStateToFile(state);
  }

  return {
    state,
    ...buildInventoryStorageMeta("file", true)
  };
}

async function readInventoryState() {
  const storageMode = resolvePreferredInventoryStorageMode();

  if (storageMode === "blob") {
    return readInventoryStateFromBlob();
  }

  if (storageMode === "readonly") {
    return {
      state: ensureInventoryStateShape(null).state,
      ...buildInventoryStorageMeta("readonly", false)
    };
  }

  return readInventoryStateFromFile();
}

async function getInventorySnapshot() {
  const inventoryResult = await readInventoryState();
  const state = inventoryResult.state;

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    storageMode: inventoryResult.storageMode,
    persistenceConfigured: inventoryResult.persistenceConfigured,
    storageLabel: inventoryResult.storageLabel,
    products: BASE_PRODUCTS.map(product => {
      const productId = normalizeText(product?.id);
      const inventoryEntry = state.items[productId] || createInventoryEntry(product, state.updatedAt);

      return {
        ...product,
        available: Boolean(inventoryEntry.available),
        stockUpdatedAt: normalizeText(inventoryEntry.updatedAt) || state.updatedAt
      };
    })
  };
}

async function getInventoryProduct(productId) {
  const normalizedProductId = normalizeText(productId);
  if (!normalizedProductId) {
    return null;
  }

  const snapshot = await getInventorySnapshot();
  return snapshot.products.find(product => normalizeText(product.id) === normalizedProductId) || null;
}

async function persistInventoryState(state, storageMode = resolvePreferredInventoryStorageMode()) {
  if (storageMode === "blob") {
    await persistInventoryStateToBlob(state);
    return;
  }

  if (storageMode === "readonly") {
    throw createInventoryStorageError(
      "inventory_storage_not_configured",
      "O estoque persistente ainda não foi configurado para produção. Conecte um Vercel Blob ao projeto para salvar as mudanças automaticamente.",
      503
    );
  }

  persistInventoryStateToFile(state);
}

async function setProductAvailability(productId, available) {
  const normalizedProductId = normalizeText(productId);
  const product = BASE_PRODUCT_MAP.get(normalizedProductId);

  if (!product) {
    const error = new Error("Produto não encontrado para atualização de estoque.");
    error.code = "unknown_inventory_product";
    error.statusCode = 404;
    throw error;
  }

  const inventoryResult = await readInventoryState();
  if (!inventoryResult.persistenceConfigured) {
    throw createInventoryStorageError(
      "inventory_storage_not_configured",
      "O estoque persistente ainda não foi configurado para produção. Conecte um Vercel Blob ao projeto para salvar as mudanças automaticamente.",
      503
    );
  }

  const state = inventoryResult.state;
  const updatedAt = new Date().toISOString();

  state.items[normalizedProductId] = {
    ...createInventoryEntry(product, updatedAt),
    available: Boolean(available)
  };
  state.updatedAt = updatedAt;

  await persistInventoryState(state, inventoryResult.storageMode);
  return getInventoryProduct(normalizedProductId);
}

async function setBulkInventoryStatus(updates = []) {
  if (!Array.isArray(updates) || !updates.length) {
    return [];
  }

  const inventoryResult = await readInventoryState();
  if (!inventoryResult.persistenceConfigured) {
    throw createInventoryStorageError(
      "inventory_storage_not_configured",
      "O estoque persistente ainda não foi configurado para produção. Conecte um Vercel Blob ao projeto para salvar as mudanças automaticamente.",
      503
    );
  }

  const state = inventoryResult.state;
  const updatedAt = new Date().toISOString();
  const changedProductIds = [];

  updates.forEach(update => {
    const normalizedProductId = normalizeText(update?.productId);
    const product = BASE_PRODUCT_MAP.get(normalizedProductId);
    if (!product) {
      const error = new Error("Produto não encontrado para atualização de estoque.");
      error.code = "unknown_inventory_product";
      error.statusCode = 404;
      throw error;
    }

    state.items[normalizedProductId] = {
      ...createInventoryEntry(product, updatedAt),
      available: Boolean(update.available)
    };
    changedProductIds.push(normalizedProductId);
  });

  state.updatedAt = updatedAt;
  await persistInventoryState(state, inventoryResult.storageMode);

  const snapshot = await getInventorySnapshot();
  return changedProductIds
    .map(productId => snapshot.products.find(product => normalizeText(product.id) === productId))
    .filter(Boolean);
}

function getInventoryCounts(snapshot) {
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];

  return products.reduce((counts, product) => {
    counts.total += 1;
    if (product.available) {
      counts.available += 1;
    } else {
      counts.unavailable += 1;
    }

    return counts;
  }, {
    total: 0,
    available: 0,
    unavailable: 0
  });
}

module.exports = {
  INVENTORY_FILE_ENV_KEY,
  INVENTORY_BLOB_PATH_ENV_KEY,
  INVENTORY_STORAGE_MODE_ENV_KEY,
  buildDefaultInventoryState,
  createInventoryStorageError,
  getInventoryCounts,
  getInventoryProduct,
  getInventorySnapshot,
  hasBlobStorageConfigured,
  persistInventoryState,
  readInventoryState,
  resolveInventoryBlobPathname,
  resolveInventoryFilePath,
  resolvePreferredInventoryStorageMode,
  setBulkInventoryStatus,
  setProductAvailability
};
