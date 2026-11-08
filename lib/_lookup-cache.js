const { createHash } = require("crypto");
const { defaultKvAdapter } = require("./_kv-storage");

// Cache em dois níveis para consultas externas (CEP, geocodificação):
// 1) memória da instância — rápido, mas some a cada cold start da Vercel;
// 2) Redis (Upstash) — compartilhado entre instâncias e persistente.
// Qualquer falha do Redis vira "miss": a cotação nunca quebra por causa do cache.
// hashKeys: grava no Redis só o SHA-256 da chave — use quando a chave contém
// dado pessoal (ex.: endereço do cliente com número), por cuidado com a LGPD.
function createLookupCache({
  namespace,
  kv = defaultKvAdapter,
  maxEntries = 500,
  ttlSeconds = 30 * 24 * 60 * 60,
  hashKeys = false
}) {
  const memory = new Map();
  const prefix = `hamburgeria:cache:${namespace}:`;
  const toStorageKey = key => prefix + (hashKeys ? createHash("sha256").update(String(key)).digest("hex") : key);

  function remember(key, value) {
    if (memory.has(key)) {
      memory.delete(key);
    } else if (memory.size >= maxEntries) {
      const oldestKey = memory.keys().next().value;
      if (oldestKey !== undefined) {
        memory.delete(oldestKey);
      }
    }
    memory.set(key, value);
  }

  async function get(key) {
    if (memory.has(key)) {
      return memory.get(key);
    }

    if (!kv.isConfigured()) {
      return null;
    }

    try {
      const value = await kv.get(toStorageKey(key));
      if (value !== null && value !== undefined) {
        remember(key, value);
        return value;
      }
    } catch {
      // Redis indisponível: segue como miss.
    }

    return null;
  }

  async function set(key, value) {
    remember(key, value);

    if (!kv.isConfigured()) {
      return;
    }

    try {
      await kv.set(toStorageKey(key), value, { expireInSeconds: ttlSeconds });
    } catch {
      // Não crítico: o valor continua na memória desta instância.
    }
  }

  return { get, set };
}

module.exports = {
  createLookupCache
};
