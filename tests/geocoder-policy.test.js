const test = require("node:test");
const assert = require("node:assert/strict");

const { _internals } = require("../api/delivery-quote");
const { createLookupCache } = require("../lib/_lookup-cache");

const { resolveAddressCoordinates } = _internals;

function endereco(numero) {
  return {
    street: "Rua Augusta Candiani",
    number: String(numero),
    neighborhood: "Campo Grande",
    city: "Rio de Janeiro",
    state: "RJ",
    cep: "23070010"
  };
}

function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    if (String(url).includes("photon.komoot.io")) {
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }
    return new Response(JSON.stringify([{ lat: "-22.9", lon: "-43.57", addresstype: "house" }]), { status: 200 });
  };
  return calls;
}

test("geocodificação: respeita a política do Nominatim (User-Agent, 1 req/s e cache)", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = stubFetch();

  // 1) Primeira consulta: Photon vazio, Nominatim responde.
  const primeira = await resolveAddressCoordinates(endereco(10));
  assert.equal(primeira.provider, "nominatim");
  const chamadaNominatim = calls.find(call => call.url.includes("nominatim.openstreetmap.org"));
  assert.match(chamadaNominatim.headers["User-Agent"], /^GalaxyBurgerDelivery\/\S+ \(\+https:\/\/galaxyburger\.vercel\.app\)$/);

  // 2) Outro endereço logo em seguida: o limite global de 1 req/s impede nova
  //    chamada ao Nominatim, e a cotação pede para tentar de novo (503).
  const nominatimAntes = calls.filter(call => call.url.includes("nominatim")).length;
  await assert.rejects(
    () => resolveAddressCoordinates(endereco(20)),
    error => error.code === "delivery_distance_lookup_failed" && error.statusCode === 503
  );
  assert.equal(calls.filter(call => call.url.includes("nominatim")).length, nominatimAntes);

  // 3) O primeiro endereço de novo: vem do cache, sem nenhuma chamada externa.
  const totalAntes = calls.length;
  const repetida = await resolveAddressCoordinates(endereco(10));
  assert.deepEqual(repetida, primeira);
  assert.equal(calls.length, totalAntes);
});

test("cache com hashKeys: o Redis não recebe o endereço em texto", async () => {
  const chavesGravadas = [];
  const kv = {
    isConfigured: () => true,
    get: async () => null,
    set: async key => { chavesGravadas.push(key); }
  };
  const cache = createLookupCache({ namespace: "geocode", kv, hashKeys: true });

  await cache.set("rua augusta candiani, 10, campo grande", { latitude: 1, longitude: 2 });

  assert.equal(chavesGravadas.length, 1);
  assert.match(chavesGravadas[0], /^hamburgeria:cache:geocode:[0-9a-f]{64}$/);
  assert.doesNotMatch(chavesGravadas[0], /augusta/);
});
