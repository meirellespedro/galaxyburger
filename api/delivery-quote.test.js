const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const handler = require("./delivery-quote");
const {
  buildDefaultDeliveryAreasState,
  normalizeDeliveryAreaName
} = require("./_delivery-areas-store");

const tempDirectories = [];
const DELIVERY_CEP_FIXTURES = Object.freeze({
  "rua augusta candiani": {
    cep: "23080010",
    neighborhood: "Campo Grande",
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua Augusta Candiani",
    coordinates: { latitude: -22.9025923, longitude: -43.5785065, precision: "street", provider: "photon" }
  },
  "rua soldado lindo sardagna": {
    cep: "23080710",
    neighborhood: "Campo Grande",
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua Soldado Lindo Sardagna",
    coordinates: { latitude: -22.8951939, longitude: -43.5736632, precision: "street", provider: "photon" }
  },
  "vila nova": {
    cep: "23070010",
    neighborhood: "Vila Nova",
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua Embaixador Muniz Gordilho",
    coordinates: { latitude: -22.9049152, longitude: -43.5780493, precision: "exact", provider: "photon" }
  },
  "santa cruz": {
    cep: "23550010",
    neighborhood: "Santa Cruz",
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua Felipe Cardoso",
    coordinates: { latitude: -22.9125, longitude: -43.694, precision: "street", provider: "photon" }
  },
  "cosmos": {
    cep: "23060100",
    neighborhood: "Cosmos",
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua das Amoreiras",
    coordinates: { latitude: -22.8775, longitude: -43.56, precision: "street", provider: "photon" }
  }
});

async function invokeHandler({ method = "POST", body = {}, query = {} } = {}) {
  const req = {
    method,
    body,
    query,
    [Symbol.asyncIterator]: async function* iterator() {}
  };
  const result = {
    statusCode: 200,
    headers: {},
    body: null
  };
  const res = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
    end(payload) {
      result.body = payload;
      return this;
    }
  };

  await handler(req, res);
  return result;
}

function configureDeliveryAreasState(mutator) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-delivery-areas-"));
  const filePath = path.join(tempDirectory, "delivery-areas.json");
  const state = buildDefaultDeliveryAreasState("2026-05-21T12:00:00.000Z");

  if (typeof mutator === "function") {
    mutator(state);
  }

  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  tempDirectories.push(tempDirectory);
  process.env.DELIVERY_AREAS_FILE_PATH = filePath;
  process.env.DELIVERY_AREAS_STORAGE_MODE = "file";
  return {
    filePath,
    state
  };
}

function saveDeliveryAreasState(filePath, state) {
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function findAreaByName(state, name) {
  const normalizedName = normalizeDeliveryAreaName(name);
  return state.areas.find(area => area.normalizedName === normalizedName) || null;
}

function buildAddress(area, overrides = {}) {
  const fixture = DELIVERY_CEP_FIXTURES[normalizeDeliveryAreaName(area.name)] || {
    cep: "23070010",
    neighborhood: area.name,
    city: "Rio de Janeiro",
    state: "RJ",
    street: "Rua Exemplo"
  };

  return {
    deliveryAreaId: area.id,
    neighborhood: fixture.neighborhood,
    street: fixture.street,
    number: "45",
    city: fixture.city,
    state: fixture.state,
    cep: fixture.cep,
    ...overrides
  };
}

function installViaCepMock() {
  globalThis.__GB_TEST_VIACEP_LOOKUP__ = async cep => {
    const fixture = Object.values(DELIVERY_CEP_FIXTURES).find(item => item.cep === cep);

    if (!fixture) {
      return { erro: true };
    }

    return {
      cep: fixture.cep,
      logradouro: fixture.street,
      bairro: fixture.neighborhood,
      localidade: fixture.city,
      uf: fixture.state
    };
  };
}

function installAddressGeoMock() {
  globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ = async address => {
    const streetKey = normalizeDeliveryAreaName(address?.street);
    const fixture = Object.values(DELIVERY_CEP_FIXTURES).find(item =>
      normalizeDeliveryAreaName(item.street) === streetKey
    );

    return fixture?.coordinates || null;
  };
}

test.afterEach(() => {
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.DELIVERY_AREAS_FILE_PATH;
  delete process.env.DELIVERY_AREAS_STORAGE_MODE;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete globalThis.__GB_TEST_VIACEP_LOOKUP__;
  delete globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__;

  while (tempDirectories.length) {
    const directory = tempDirectories.pop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("retorna status online quando chamado sem token", async () => {
  const response = await invokeHandler({
    method: "GET"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "online");
});

test("calcula taxa de R$ 5,00 para regiao da zona proxima", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.ok(response.body.deliveryArea.id);
  assert.equal(response.body.message, "Entrega disponível para sua região. Taxa: R$ 5,00.");
  assert.ok(response.body.quote?.token);
});

test("calcula taxa de R$ 10,00 para regiao da zona intermediaria", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Cosmos");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_10");
  assert.equal(response.body.fee, 10);
  assert.equal(response.body.deliveryArea.id, area.id);
  assert.equal(response.body.message, "Entrega disponível para sua região. Taxa: R$ 10,00.");
});

test("usa a taxa cadastrada na rua mesmo com numero diferente quando a distancia seria menor", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const customStreet = "Rua Teste Prioridade Do Painel";
  globalThis.__GB_TEST_VIACEP_LOOKUP__ = async cep => ({
    cep,
    logradouro: customStreet,
    bairro: "Vila Nova",
    localidade: "Rio de Janeiro",
    uf: "RJ"
  });
  globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ = async () => ({
    latitude: -22.9049152,
    longitude: -43.5780493,
    precision: "exact",
    provider: "photon"
  });
  const { filePath, state } = configureDeliveryAreasState();

  state.areas.push({
    id: "area_rua_teste_prioridade_do_painel_custom",
    name: customStreet,
    zoneId: "zone_10",
    fee: 10,
    status: "active",
    note: "Taxa cadastrada no painel administrativo."
  });
  state.updatedAt = "2026-05-21T12:30:00.000Z";
  saveDeliveryAreasState(filePath, state);

  const response = await invokeHandler({
    body: {
      cep: "23070099",
      street: customStreet,
      number: "999",
      neighborhood: "Vila Nova",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_10");
  assert.equal(response.body.fee, 10);
  assert.equal(response.body.deliveryArea.name, customStreet);
});

test("calcula taxa de R$ 5,00 para Rua Augusta Candiani", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Rua Augusta Candiani");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.deliveryArea.name, "Rua Augusta Candiani");
});

test("reconhece R. Augusta Candiani como zona de R$ 5,00", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23080010",
      street: "R. Augusta Candiani",
      number: "50",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
});

test("reconhece Augusta Candiani como zona de R$ 5,00", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23080010",
      street: "Augusta Candiani",
      number: "50",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
});

test("calcula taxa de R$ 5,00 para Rua Soldado Lindo Sardagna", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Rua Soldado Lindo Sardagna");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.deliveryArea.name, "Rua Soldado Lindo Sardagna");
});

test("reconhece Soldado Lindo Sardagna como zona de R$ 5,00", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23080710",
      street: "Soldado Lindo Sardagna",
      number: "173",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
});

test("migra storage legado e recupera ruas proximas obrigatorias na zona de R$ 5,00", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const removedNames = new Set([
    normalizeDeliveryAreaName("Rua Augusta Candiani"),
    normalizeDeliveryAreaName("Rua Soldado Lindo Sardagna")
  ]);
  const { filePath, state } = configureDeliveryAreasState(nextState => {
    nextState.version = 2;
    nextState.areas = nextState.areas.filter(area => !removedNames.has(area.normalizedName));
  });

  const response = await invokeHandler({
    body: {
      deliveryAreaId: "",
      neighborhood: "Campo Grande",
      street: "Rua Soldado Lindo Sardagna",
      number: "173",
      city: "Rio de Janeiro",
      state: "RJ",
      cep: "23080710"
    }
  });

  const migratedState = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.deliveryArea.name, "Rua Soldado Lindo Sardagna");
  assert.equal(migratedState.version, 3);
  assert.ok(
    migratedState.areas.some(area => area.normalizedName === normalizeDeliveryAreaName("Rua Soldado Lindo Sardagna"))
  );
});

test("prioriza rua proxima cadastrada para cobrar R$ 5,00 mesmo dentro de bairro mais amplo", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  globalThis.__GB_TEST_VIACEP_LOOKUP__ = async () => ({
    cep: "23070010",
    logradouro: "Rua Embaixador Muniz Gordilho",
    bairro: "Campo Grande",
    localidade: "Rio de Janeiro",
    uf: "RJ"
  });
  globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ = async () => ({
    latitude: -22.9049152,
    longitude: -43.5780493,
    precision: "exact",
    provider: "photon"
  });
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23070011",
      street: "Rua Embaixador Muniz Gordilho",
      number: "199",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.address.neighborhood, "Campo Grande");
  assert.equal(response.body.deliveryArea.name, "Rua Embaixador Muniz Gordilho");
});

test("cobra R$ 5,00 para endereco nao cadastrado quando a distancia fica ate 2,9 km", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  globalThis.__GB_TEST_VIACEP_LOOKUP__ = async () => ({
    cep: "23070030",
    logradouro: "Rua Projetada Proxima",
    bairro: "Campo Grande",
    localidade: "Rio de Janeiro",
    uf: "RJ"
  });
  globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ = async () => ({
    latitude: -22.9005,
    longitude: -43.5772,
    precision: "street",
    provider: "photon"
  });
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23070030",
      street: "Rua Projetada Proxima",
      number: "45",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_5");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.deliveryArea.name, "Campo Grande");
});

test("normaliza abreviacao e espacos extras ao comparar ruas proximas", () => {
  assert.equal(
    normalizeDeliveryAreaName("R. Augusta Candiani"),
    normalizeDeliveryAreaName("Rua Augusta Candiani")
  );
  assert.equal(
    normalizeDeliveryAreaName("  Rua   Soldado   Lindo Sardagna "),
    normalizeDeliveryAreaName("Rua Soldado Lindo Sardagna")
  );
});

test("ignora rua manipulada pelo cliente e usa a rua oficial do CEP", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23060100",
      street: "Rua Augusta Candiani",
      number: "45",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "zone_10");
  assert.equal(response.body.fee, 10);
  assert.equal(response.body.address.street, "Rua das Amoreiras");
  assert.equal(response.body.deliveryArea.name, "Cosmos");
});

test("retorna bloqueado quando a regiao esta sem entrega", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Santa Cruz");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "blocked");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.deliveryArea.id, area.id);
  assert.equal(response.body.message, "No momento não entregamos nessa região. Você pode escolher retirada no local.");
});

test("retorna somente retirada quando a regiao esta nessa zona", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState(nextState => {
    const area = findAreaByName(nextState, "Cosmos");
    area.zoneId = "pickup_only";
    area.updatedAt = "2026-05-21T13:00:00.000Z";
    nextState.updatedAt = area.updatedAt;
  });
  const area = findAreaByName(state, "Cosmos");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "pickup_only");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.deliveryArea.id, area.id);
  assert.equal(response.body.message, "Para essa região, no momento trabalhamos apenas com retirada no local.");
});

test("libera apenas retirada para endereco acima de 5 km pela distancia", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  globalThis.__GB_TEST_VIACEP_LOOKUP__ = async () => ({
    cep: "23560000",
    logradouro: "Rua Longe Demais",
    bairro: "Campo Grande",
    localidade: "Rio de Janeiro",
    uf: "RJ"
  });
  globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__ = async () => ({
    latitude: -22.854,
    longitude: -43.545,
    precision: "approximate",
    provider: "photon"
  });
  configureDeliveryAreasState();

  const response = await invokeHandler({
    body: {
      cep: "23560000",
      street: "Rua Longe Demais",
      number: "900",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "pickup_only");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.zone, "pickup_only");
});

test("bloqueia endereco incompleto antes de gerar a taxa", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const response = await invokeHandler({
    body: buildAddress(area, {
      number: ""
    })
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "missing_address_field");
  assert.equal(response.body.message, "Preencha o endereço completo para calcular a entrega.");
});

test("invalida uma cotacao salva quando a rua validada fica bloqueada depois", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  installViaCepMock();
  installAddressGeoMock();
  const { filePath, state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quoted = await invokeHandler({
    body: buildAddress(area)
  });

  const nextState = JSON.parse(JSON.stringify(state));
  const nextArea = nextState.areas.find(candidate => candidate.id === quoted.body.deliveryArea.id);
  nextArea.zoneId = "blocked";
  nextArea.updatedAt = "2026-05-21T14:00:00.000Z";
  nextState.updatedAt = nextArea.updatedAt;
  saveDeliveryAreasState(filePath, nextState);

  const verified = await invokeHandler({
    method: "GET",
    query: {
      token: quoted.body.quote.token
    }
  });

  assert.equal(verified.statusCode, 409);
  assert.equal(verified.body.ok, false);
  assert.equal(verified.body.code, "delivery_area_blocked");
});
