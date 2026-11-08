const KV_URL_ENV_KEY = "UPSTASH_REDIS_REST_URL";
const KV_TOKEN_ENV_KEY = "UPSTASH_REDIS_REST_TOKEN";
const KV_REQUEST_TIMEOUT_MS = 3000;

let cachedRedisClient = null;

function normalizeText(value) {
  return String(value || "").trim();
}

// Vercel's env var UI/CLI has a history of round-tripping a stray pair of
// quotes into the stored value (e.g. a value pasted as "https://...upstash.io"
// gets saved with the quote characters included). That breaks URL validation
// entirely, so strip one matching pair of wrapping quotes defensively.
function stripWrappingQuotes(value) {
  const text = normalizeText(value);
  const firstChar = text.charAt(0);
  const lastChar = text.charAt(text.length - 1);

  if (text.length >= 2 && lastChar === firstChar && (firstChar === '"' || firstChar === "'")) {
    return text.slice(1, -1).trim();
  }

  return text;
}

function getKvUrl() {
  return stripWrappingQuotes(process.env[KV_URL_ENV_KEY]);
}

function getKvToken() {
  return stripWrappingQuotes(process.env[KV_TOKEN_ENV_KEY]);
}

function isKvStorageConfigured() {
  return Boolean(getKvUrl() && getKvToken());
}

function getRedisClient() {
  if (!isKvStorageConfigured()) {
    return null;
  }

  if (!cachedRedisClient) {
    const { Redis } = require("@upstash/redis");
    cachedRedisClient = new Redis({
      url: getKvUrl(),
      token: getKvToken(),
      // Bound each attempt so a hung Upstash request can't eat the whole
      // serverless function timeout budget; one quick retry covers blips.
      signal: () => AbortSignal.timeout(KV_REQUEST_TIMEOUT_MS),
      retry: {
        retries: 1,
        backoff: () => 200
      }
    });
  }

  return cachedRedisClient;
}

function createKvStorageError(cause, operation, key) {
  const error = new Error("Não foi possível acessar o armazenamento (Upstash Redis).");
  error.code = "kv_storage_error";
  error.statusCode = 502;
  error.cause = cause;
  console.error(`[kv-storage] ${operation} failed for key "${key}":`, cause?.message || cause);
  return error;
}

async function kvGetJSON(key) {
  try {
    const client = getRedisClient();
    if (!client) {
      return null;
    }

    const value = await client.get(key);
    if (value === null || value === undefined) {
      return null;
    }

    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw createKvStorageError(error, "get", key);
  }
}

async function kvSetJSON(key, value, { expireInSeconds } = {}) {
  try {
    const client = getRedisClient();
    if (!client) {
      throw new Error("Upstash Redis não está configurado neste ambiente.");
    }

    const serialized = JSON.stringify(value);
    if (expireInSeconds) {
      await client.set(key, serialized, { ex: Math.max(1, Math.round(expireInSeconds)) });
    } else {
      await client.set(key, serialized);
    }
  } catch (error) {
    throw createKvStorageError(error, "set", key);
  }
}

// Grava só se a chave não existir (SET NX PX). Usado como trava distribuída.
async function kvSetIfAbsent(key, value, { expireInMs } = {}) {
  try {
    const client = getRedisClient();
    if (!client) {
      throw new Error("Upstash Redis não está configurado neste ambiente.");
    }

    const result = await client.set(key, JSON.stringify(value), {
      nx: true,
      px: Math.max(1, Math.round(expireInMs || 1000))
    });
    return result === "OK";
  } catch (error) {
    throw createKvStorageError(error, "setnx", key);
  }
}

// Contador atômico (INCR). A expiração só é definida no primeiro incremento,
// então a janela é fixa e não é renovada a cada tentativa.
async function kvIncrWithExpiry(key, windowSeconds) {
  try {
    const client = getRedisClient();
    if (!client) {
      throw new Error("Upstash Redis não está configurado neste ambiente.");
    }

    const count = Number(await client.incr(key));
    if (count === 1) {
      await client.expire(key, Math.max(1, Math.round(windowSeconds)));
    }
    return count;
  } catch (error) {
    throw createKvStorageError(error, "incr", key);
  }
}

// Adaptador único para os módulos que aceitam um armazenamento injetável
// (cache de consultas, trava externa e rate limit). Os testes passam um falso.
const defaultKvAdapter = Object.freeze({
  isConfigured: isKvStorageConfigured,
  get: kvGetJSON,
  set: kvSetJSON,
  setIfAbsent: (key, value, expireInMs) => kvSetIfAbsent(key, value, { expireInMs }),
  incrWithExpiry: kvIncrWithExpiry
});

module.exports = {
  KV_TOKEN_ENV_KEY,
  KV_URL_ENV_KEY,
  defaultKvAdapter,
  isKvStorageConfigured,
  kvGetJSON,
  kvIncrWithExpiry,
  kvSetIfAbsent,
  kvSetJSON
};
