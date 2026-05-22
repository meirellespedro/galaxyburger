const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

const ORDER_TICKET_DIRECTORY_ENV_KEY = "ORDER_TICKET_DIRECTORY_PATH";
const ORDER_TICKET_BLOB_PREFIX_ENV_KEY = "ORDER_TICKET_BLOB_PREFIX";
const ORDER_TICKET_STORAGE_MODE_ENV_KEY = "ORDER_TICKET_STORAGE_MODE";
const ORDER_TICKET_STATE_VERSION = 1;
const ORDER_TICKET_REF_PREFIX = "gbt_";
const DEFAULT_ORDER_TICKET_DIRECTORY = path.join(process.cwd(), "data", "order-tickets");
const DEFAULT_ORDER_TICKET_BLOB_PREFIX = "orders/galaxy-burger/order-tickets";

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

function resolvePreferredOrderTicketStorageMode() {
  const explicitMode = normalizeCompareText(process.env[ORDER_TICKET_STORAGE_MODE_ENV_KEY]).replace(/\s+/g, "_");

  if (["file", "blob"].includes(explicitMode)) {
    return explicitMode;
  }

  if (hasBlobStorageConfigured()) {
    return "blob";
  }

  return isVercelRuntime() ? "readonly" : "file";
}

function resolveOrderTicketDirectoryPath() {
  const configuredPath = normalizeText(process.env[ORDER_TICKET_DIRECTORY_ENV_KEY]);
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return DEFAULT_ORDER_TICKET_DIRECTORY;
}

function resolveOrderTicketBlobPrefix() {
  return (normalizeText(process.env[ORDER_TICKET_BLOB_PREFIX_ENV_KEY]) || DEFAULT_ORDER_TICKET_BLOB_PREFIX)
    .replace(/\/+$/g, "");
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPersistedOrderTicketRef() {
  return `${ORDER_TICKET_REF_PREFIX}${encodeBase64Url(randomBytes(9))}`;
}

function isPersistedOrderTicketRef(value) {
  return normalizeText(value).startsWith(ORDER_TICKET_REF_PREFIX);
}

function sanitizePersistedOrderTicketRef(value) {
  const normalizedValue = normalizeText(value);
  return /^[A-Za-z0-9_-]+$/.test(normalizedValue) && isPersistedOrderTicketRef(normalizedValue)
    ? normalizedValue
    : "";
}

function canPersistSharedOrderTicket() {
  return resolvePreferredOrderTicketStorageMode() !== "readonly";
}

async function getBlobSdk() {
  if (!hasBlobStorageConfigured()) {
    return null;
  }

  try {
    return require("@vercel/blob");
  } catch {
    throw new Error(
      "A persistencia curta das comandas depende do pacote @vercel/blob quando o storage Blob estiver ativo."
    );
  }
}

function buildOrderTicketBlobPathname(ticketRef) {
  return `${resolveOrderTicketBlobPrefix()}/${ticketRef}.json`;
}

function buildOrderTicketFilePath(ticketRef) {
  return path.join(resolveOrderTicketDirectoryPath(), `${ticketRef}.json`);
}

function buildOrderTicketStoragePayload(order) {
  return {
    version: ORDER_TICKET_STATE_VERSION,
    savedAt: new Date().toISOString(),
    order
  };
}

async function persistSharedOrderTicketToBlob(ticketRef, order) {
  const blobSdk = await getBlobSdk();
  const serialized = `${JSON.stringify(buildOrderTicketStoragePayload(order), null, 2)}\n`;

  await blobSdk.put(buildOrderTicketBlobPathname(ticketRef), serialized, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

async function readSharedOrderTicketFromBlob(ticketRef) {
  const blobSdk = await getBlobSdk();
  const result = await blobSdk.get(buildOrderTicketBlobPathname(ticketRef), {
    access: "private"
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const rawContent = await new Response(result.stream).text();
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  return parsedContent?.order || null;
}

function persistSharedOrderTicketToFile(ticketRef, order) {
  const directoryPath = resolveOrderTicketDirectoryPath();
  const filePath = buildOrderTicketFilePath(ticketRef);
  const serialized = `${JSON.stringify(buildOrderTicketStoragePayload(order), null, 2)}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readSharedOrderTicketFromFile(ticketRef) {
  const filePath = buildOrderTicketFilePath(ticketRef);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
  return parsedContent?.order || null;
}

async function persistSharedOrderTicket(ticketRef, order) {
  const normalizedRef = sanitizePersistedOrderTicketRef(ticketRef);
  if (!normalizedRef || !order || typeof order !== "object") {
    throw new Error("A comanda curta nao pode ser salva sem uma referencia valida.");
  }

  const storageMode = resolvePreferredOrderTicketStorageMode();
  if (storageMode === "readonly") {
    return false;
  }

  if (storageMode === "blob") {
    await persistSharedOrderTicketToBlob(normalizedRef, order);
    return true;
  }

  persistSharedOrderTicketToFile(normalizedRef, order);
  return true;
}

async function readSharedOrderTicket(ticketRef) {
  const normalizedRef = sanitizePersistedOrderTicketRef(ticketRef);
  if (!normalizedRef) {
    return null;
  }

  const storageMode = resolvePreferredOrderTicketStorageMode();
  if (storageMode === "readonly") {
    return null;
  }

  if (storageMode === "blob") {
    return readSharedOrderTicketFromBlob(normalizedRef);
  }

  return readSharedOrderTicketFromFile(normalizedRef);
}

module.exports = {
  ORDER_TICKET_BLOB_PREFIX_ENV_KEY,
  ORDER_TICKET_DIRECTORY_ENV_KEY,
  ORDER_TICKET_REF_PREFIX,
  ORDER_TICKET_STORAGE_MODE_ENV_KEY,
  canPersistSharedOrderTicket,
  createPersistedOrderTicketRef,
  isPersistedOrderTicketRef,
  persistSharedOrderTicket,
  readSharedOrderTicket,
  resolveOrderTicketBlobPrefix,
  resolveOrderTicketDirectoryPath,
  resolvePreferredOrderTicketStorageMode
};
