const KV_URL_ENV_KEY = "UPSTASH_REDIS_REST_URL";
const KV_TOKEN_ENV_KEY = "UPSTASH_REDIS_REST_TOKEN";

let cachedRedisClient = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function isKvStorageConfigured() {
  return Boolean(normalizeText(process.env[KV_URL_ENV_KEY]) && normalizeText(process.env[KV_TOKEN_ENV_KEY]));
}

function getRedisClient() {
  if (!isKvStorageConfigured()) {
    return null;
  }

  if (!cachedRedisClient) {
    const { Redis } = require("@upstash/redis");
    cachedRedisClient = new Redis({
      url: normalizeText(process.env[KV_URL_ENV_KEY]),
      token: normalizeText(process.env[KV_TOKEN_ENV_KEY])
    });
  }

  return cachedRedisClient;
}

function createKvStorageError(cause) {
  const error = new Error("Não foi possível acessar o armazenamento (Upstash Redis).");
  error.code = "kv_storage_error";
  error.statusCode = 502;
  error.cause = cause;
  return error;
}

async function kvGetJSON(key) {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const value = await client.get(key);
    if (value === null || value === undefined) {
      return null;
    }

    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw createKvStorageError(error);
  }
}

async function kvSetJSON(key, value, { expireInSeconds } = {}) {
  const client = getRedisClient();
  if (!client) {
    throw createKvStorageError(new Error("Upstash Redis não está configurado neste ambiente."));
  }

  try {
    const serialized = JSON.stringify(value);
    if (expireInSeconds) {
      await client.set(key, serialized, { ex: Math.max(1, Math.round(expireInSeconds)) });
    } else {
      await client.set(key, serialized);
    }
  } catch (error) {
    throw createKvStorageError(error);
  }
}

module.exports = {
  KV_TOKEN_ENV_KEY,
  KV_URL_ENV_KEY,
  isKvStorageConfigured,
  kvGetJSON,
  kvSetJSON
};
