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
  return {
    cep: "23070-010",
    street: "Rua sem cadastro",
    number: "45",
    neighborhood: area.name,
    city: "Rio de Janeiro",
    state: "RJ",
    deliveryAreaId: area.id,
    ...overrides
  };
}

test.afterEach(() => {
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.DELIVERY_AREAS_FILE_PATH;
  delete process.env.DELIVERY_AREAS_STORAGE_MODE;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;

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

test("calcula taxa para bairro ativo cadastrado", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "delivery_area");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.deliveryArea.id, area.id);
  assert.equal(response.body.deliveryArea.name, area.name);
  assert.equal(response.body.message, "Entrega disponivel para sua regiao. Taxa: R$ 5,00.");
  assert.ok(response.body.quote?.token);
});

test("retorna bloqueado quando o bairro esta sem entrega", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Santa Cruz");

  const response = await invokeHandler({
    body: buildAddress(area)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "blocked");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.deliveryArea.id, area.id);
  assert.equal(response.body.message, "No momento nao entregamos nessa regiao. Voce pode escolher retirada no local.");
});

test("retorna somente retirada quando o bairro esta nesse modo", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const { state } = configureDeliveryAreasState(nextState => {
    const area = findAreaByName(nextState, "Cosmos");
    area.status = "pickup_only";
    area.note = "Somente retirada para testes.";
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
  assert.equal(response.body.message, "Para essa regiao, no momento trabalhamos apenas com retirada no local.");
});

test("exige deliveryAreaId para calcular a taxa", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const { state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const response = await invokeHandler({
    body: buildAddress(area, {
      deliveryAreaId: ""
    })
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "missing_address_field");
});

test("invalida uma cotacao salva quando a taxa do bairro muda", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  const { filePath, state } = configureDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quoted = await invokeHandler({
    body: buildAddress(area)
  });

  const nextState = JSON.parse(JSON.stringify(state));
  const nextArea = findAreaByName(nextState, "Vila Nova");
  nextArea.fee = 7;
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
  assert.equal(verified.body.code, "delivery_area_changed");
});
