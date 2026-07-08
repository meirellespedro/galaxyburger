const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const {
  blobGet,
  blobPut,
  createBlobStorageAccessError,
  hasBlobStorageConfigured,
  logBlobStorageEvent,
  sanitizeBlobError
} = require("./_blob-storage");

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

function createOrderTicketStorageError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = "error";
  return error;
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
  const pathname = buildOrderTicketBlobPathname(ticketRef);
  const serialized = `${JSON.stringify(buildOrderTicketStoragePayload(order), null, 2)}\n`;

  try {
    await blobPut(pathname, serialized, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 3600
    });
  } catch (error) {
    throw createBlobStorageAccessError(error, {
      createStorageError: createOrderTicketStorageError,
      codePrefix: "order_ticket",
      operation: "write",
      pathname,
      fallbackMessage: "Nao foi possivel salvar a comanda curta no Vercel Blob agora."
    });
  }
}

async function readSharedOrderTicketFromBlob(ticketRef) {
  const pathname = buildOrderTicketBlobPathname(ticketRef);
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await blobGet(pathname, { access: "private" });

      if (!response || typeof response.stream === "undefined") {
        return null;
      }

      const rawContent = await new Response(response.stream).text();
      const parsedContent = rawContent.trim() ? JSON.parse(rawContent) : null;
      return parsedContent?.order || null;
    } catch (error) {
      lastError = error;

      // If file doesn't exist, it's not an error - just return null
      if (error?.code === "BLOB_NOT_FOUND" || (error?.message && error.message.includes("404"))) {
        return null;
      }

      if (attempt < maxRetries) {
        logBlobStorageEvent("warn", "order_ticket_blob_read_retry", {
          attempt,
          maxRetries,
          pathname,
          error: sanitizeBlobError(error)
        });
        await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
      }
    }
  }

  throw createBlobStorageAccessError(lastError, {
    createStorageError: createOrderTicketStorageError,
    codePrefix: "order_ticket",
    operation: "read",
    pathname,
    fallbackMessage: "Nao foi possivel carregar a comanda curta do Vercel Blob agora."
  });
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
    try {
      return await readSharedOrderTicketFromBlob(normalizedRef);
    } catch (error) {
      const isAuthError = Number(error?.statusCode || 0) === 503 && normalizeText(error?.code).includes("forbidden");
      if (isAuthError) {
        logBlobStorageEvent("warn", "order_ticket_blob_auth_fallback", { error: sanitizeBlobError(error) });
        return null;
      }
      throw error;
    }
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
