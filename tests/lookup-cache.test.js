const test = require("node:test");
const assert = require("node:assert/strict");

const { createLookupCache } = require("../lib/_lookup-cache");
const { createExternalThrottle } = require("../lib/_external-throttle");
const { assertRateLimitNotExceeded } = require("../lib/_rate-limit");

// Redis falso: mesmo contrato do adaptador em lib/_kv-storage.js.
function createFakeKv() {
  const store = new Map();
  const calls = { get: 0, set: 0, setIfAbsent: 0, incr: 0 };
  return {
    store,
    calls,
    isConfigured: () => true,
    async get(key) {
      calls.get += 1;
      return store.has(key) ? store.get(key).value : null;
    },
    async set(key, value, { expireInSeconds } = {}) {
      calls.set += 1;
      store.set(key, { value, ttl: expireInSeconds });
    },
    async setIfAbsent(key, value) {
      calls.setIfAbsent += 1;
      if (store.has(key)) return false;
      store.set(key, { value });
      return true;
    },
    async incrWithExpiry(key, windowSeconds) {
      calls.incr += 1;
      const current = store.has(key) ? store.get(key).value : 0;
      store.set(key, { value: current + 1, ttl: windowSeconds });
      return current + 1;
    }
  };
}

test("cache de consulta: valor salvo no Redis sobrevive a uma instância nova (cold start)", async () => {
  const kv = createFakeKv();
  const instanciaA = createLookupCache({ namespace: "cep", kv, ttlSeconds: 60 });
  await instanciaA.set("23070010", { bairro: "Campo Grande" });

  const instanciaB = createLookupCache({ namespace: "cep", kv, ttlSeconds: 60 });
  assert.deepEqual(await instanciaB.get("23070010"), { bairro: "Campo Grande" });
  assert.equal(kv.store.get("hamburgeria:cache:cep:23070010").ttl, 60);
});

test("cache de consulta: segunda leitura na mesma instância não vai ao Redis", async () => {
  const kv = createFakeKv();
  const cache = createLookupCache({ namespace: "geo", kv });
  await cache.set("rua x", { latitude: 1, longitude: 2 });
  kv.calls.get = 0;

  await cache.get("rua x");
  await cache.get("rua x");
  assert.equal(kv.calls.get, 0);
});

test("cache de consulta: falha do Redis não quebra a cotação (vira miss)", async () => {
  const kv = createFakeKv();
  kv.get = async () => { throw new Error("redis fora"); };
  kv.set = async () => { throw new Error("redis fora"); };
  const cache = createLookupCache({ namespace: "cep", kv });

  await cache.set("1", { ok: true });
  assert.deepEqual(await cache.get("1"), { ok: true });
  assert.equal(await cache.get("nao-existe"), null);
});

test("cache de consulta: sem Redis configurado usa só memória", async () => {
  const kv = createFakeKv();
  kv.isConfigured = () => false;
  const cache = createLookupCache({ namespace: "cep", kv });

  await cache.set("1", { ok: true });
  assert.deepEqual(await cache.get("1"), { ok: true });
  assert.equal(kv.calls.set, 0);
});

test("cache de consulta: respeita o limite de entradas em memória", async () => {
  const kv = createFakeKv();
  kv.isConfigured = () => false;
  const cache = createLookupCache({ namespace: "cep", kv, maxEntries: 2 });

  await cache.set("a", 1);
  await cache.set("b", 2);
  await cache.set("c", 3);
  assert.equal(await cache.get("a"), null);
  assert.equal(await cache.get("c"), 3);
});

test("trava global: só uma chamada ao Nominatim por intervalo, entre instâncias", async () => {
  const kv = createFakeKv();
  const throttleA = createExternalThrottle({ kv });
  const throttleB = createExternalThrottle({ kv });

  assert.equal(await throttleA.tryAcquire("nominatim", 1100), true);
  assert.equal(await throttleB.tryAcquire("nominatim", 1100), false);
});

test("trava global: sem Redis cai para trava local por instância", async () => {
  let agora = 10_000;
  const kv = createFakeKv();
  kv.isConfigured = () => false;
  const throttle = createExternalThrottle({ kv, now: () => agora });

  assert.equal(await throttle.tryAcquire("nominatim", 1100), true);
  assert.equal(await throttle.tryAcquire("nominatim", 1100), false);
  agora += 1200;
  assert.equal(await throttle.tryAcquire("nominatim", 1100), true);
});

test("trava global: erro no Redis usa a trava local em vez de liberar sem limite", async () => {
  let agora = 0;
  const kv = createFakeKv();
  kv.setIfAbsent = async () => { throw new Error("redis fora"); };
  const throttle = createExternalThrottle({ kv, now: () => agora });

  assert.equal(await throttle.tryAcquire("nominatim", 1100), true);
  assert.equal(await throttle.tryAcquire("nominatim", 1100), false);
});

test("rate limit: contagem atômica bloqueia a partir da tentativa acima do máximo", async () => {
  const kv = createFakeKv();
  const req = { headers: { "x-forwarded-for": "198.51.100.4" } };
  const options = {
    scope: "teste",
    maxAttempts: 2,
    windowSeconds: 60,
    createError: () => Object.assign(new Error("limite"), { statusCode: 429 }),
    storage: kv
  };

  await assertRateLimitNotExceeded(req, options);
  await assertRateLimitNotExceeded(req, options);
  await assert.rejects(() => assertRateLimitNotExceeded(req, options), /limite/);
  assert.equal(kv.calls.incr, 3);
});

test("rate limit: a janela não é renovada a cada tentativa", async () => {
  const kv = createFakeKv();
  let expiracoes = 0;
  kv.incrWithExpiry = async function (key, windowSeconds) {
    const current = this.store.has(key) ? this.store.get(key).value : 0;
    if (current === 0) expiracoes += 1;
    this.store.set(key, { value: current + 1, ttl: windowSeconds });
    return current + 1;
  };
  const req = { headers: { "x-forwarded-for": "198.51.100.5" } };
  const options = { scope: "t", maxAttempts: 10, windowSeconds: 60, createError: () => new Error("x"), storage: kv };

  for (let i = 0; i < 5; i += 1) await assertRateLimitNotExceeded(req, options);
  assert.equal(expiracoes, 1);
});

test("rate limit: falha do Redis nunca bloqueia pedido real", async () => {
  const kv = createFakeKv();
  kv.incrWithExpiry = async () => { throw new Error("redis fora"); };
  const req = { headers: {} };

  await assertRateLimitNotExceeded(req, {
    scope: "t", maxAttempts: 1, windowSeconds: 60, createError: () => new Error("x"), storage: kv
  });
});
