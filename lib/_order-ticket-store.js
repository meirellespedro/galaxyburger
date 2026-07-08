const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

const ORDER_TICKET_DIRECTORY_ENV_KEY = "ORDER_TICKET_DIRECTORY_PATH";
const ORDER_TICKET_STORAGE_MODE_ENV_KEY = "ORDER_TICKET_STORAGE_MODE";
const ORDER_TICKET_STATE_VERSION = 1;
const ORDER_TICKET_REF_PREFIX = "gbt_";
const DEFAULT_ORDER_TICKET_DIRECTORY = path.join(process.cwd(), "data", "order-tickets");

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

  if (explicitMode === "file") {
    return explicitMode;
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

  return readSharedOrderTicketFromFile(normalizedRef);
}

module.exports = {
  ORDER_TICKET_DIRECTORY_ENV_KEY,
  ORDER_TICKET_REF_PREFIX,
  ORDER_TICKET_STORAGE_MODE_ENV_KEY,
  canPersistSharedOrderTicket,
  createPersistedOrderTicketRef,
  isPersistedOrderTicketRef,
  persistSharedOrderTicket,
  readSharedOrderTicket,
  resolveOrderTicketDirectoryPath,
  resolvePreferredOrderTicketStorageMode
};
