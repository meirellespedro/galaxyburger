const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const deliveryHandler = require("./delivery-quote");
const orderHandler = require("./order-ticket");
const {
  buildDefaultDeliveryAreasState,
  normalizeDeliveryAreaName
} = require("./_delivery-areas-store");

let testOrderTicketDirectory = "";
let testDeliveryAreasDirectory = "";
let testDeliveryAreasFilePath = "";
const DELIVERY_CEP_FIXTURES = Object.freeze({
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
  }
});

async function invokeHandler(handler, { method = "POST", body = {}, query = {} } = {}) {
  const req = {
    method,
    body,
    query,
    headers: {
      host: "galaxyburger.vercel.app",
      "x-forwarded-proto": "https"
    },
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

function buildBaseOrderPayload(overrides = {}) {
  return {
    customer: {
      name: "Beatriz",
      phone: "(21) 99999-9999"
    },
    fulfillment: "pickup",
    payment: {
      method: "pix",
      cashChangeText: ""
    },
    notes: "Sem cebola",
    cart: [
      {
        productId: "burger-poro-cosmico",
        quantity: 2
      }
    ],
    ...overrides
  };
}

function configureLocalOrderTicketStorage() {
  testOrderTicketDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-order-ticket-"));
  process.env.ORDER_TICKET_STORAGE_MODE = "file";
  process.env.ORDER_TICKET_DIRECTORY_PATH = testOrderTicketDirectory;
}

function configureLocalDeliveryAreasState(mutator) {
  testDeliveryAreasDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-order-delivery-areas-"));
  testDeliveryAreasFilePath = path.join(testDeliveryAreasDirectory, "delivery-areas.json");
  const state = buildDefaultDeliveryAreasState("2026-05-21T12:00:00.000Z");

  if (typeof mutator === "function") {
    mutator(state);
  }

  fs.writeFileSync(testDeliveryAreasFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  process.env.DELIVERY_AREAS_STORAGE_MODE = "file";
  process.env.DELIVERY_AREAS_FILE_PATH = testDeliveryAreasFilePath;
  return state;
}

function saveDeliveryAreasState(state) {
  fs.writeFileSync(testDeliveryAreasFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function findAreaByName(state, name) {
  const normalizedName = normalizeDeliveryAreaName(name);
  return state.areas.find(area => area.normalizedName === normalizedName) || null;
}

function buildDeliveryAddress(area, overrides = {}) {
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

function getTicketIdentifier(url) {
  const parsedUrl = new URL(url);
  return parsedUrl.searchParams.get("ticket") || parsedUrl.searchParams.get("order");
}

test.afterEach(() => {
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.ORDER_TICKET_SECRET;
  delete process.env.ORDER_TICKET_DIRECTORY_PATH;
  delete process.env.ORDER_TICKET_STORAGE_MODE;
  delete process.env.DELIVERY_AREAS_FILE_PATH;
  delete process.env.DELIVERY_AREAS_STORAGE_MODE;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete globalThis.__GB_TEST_VIACEP_LOOKUP__;
  delete globalThis.__GB_TEST_ADDRESS_GEO_LOOKUP__;

  if (testOrderTicketDirectory) {
    fs.rmSync(testOrderTicketDirectory, { recursive: true, force: true });
    testOrderTicketDirectory = "";
  }

  if (testDeliveryAreasDirectory) {
    fs.rmSync(testDeliveryAreasDirectory, { recursive: true, force: true });
    testDeliveryAreasDirectory = "";
    testDeliveryAreasFilePath = "";
  }
});

test("retorna status online sem token", async () => {
  const response = await invokeHandler(orderHandler, {
    method: "GET"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "online");
});

test("prepara pedido de retirada com link curto quando a persistencia esta disponivel", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload()
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.order.isPickup, true);
  assert.equal(response.body.order.subtotalValue, 49.8);
  assert.equal(response.body.order.totalValue, 49.8);
  assert.ok(response.body.ticketToken);
  assert.match(response.body.sharedTicketUrl, /[?&]ticket=gbt_/);
  assert.ok(response.body.sharedTicketUrl.length < 120);
  assert.match(response.body.whatsAppMessage, /Comanda segura da loja/);
});

test("abre pedido pronto pelo token seguro compactado", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();

  const prepared = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload()
  });

  const reopened = await invokeHandler(orderHandler, {
    method: "GET",
    query: {
      token: prepared.body.ticketToken
    }
  });

  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.body.ok, true);
  assert.equal(reopened.body.order.orderCode, prepared.body.order.orderCode);
  assert.equal(reopened.body.order.totalValue, prepared.body.order.totalValue);
});

test("abre pedido pronto pela referencia curta compartilhada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();

  const prepared = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload()
  });

  const reopened = await invokeHandler(orderHandler, {
    method: "GET",
    query: {
      ticket: getTicketIdentifier(prepared.body.sharedTicketUrl)
    }
  });

  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.body.ok, true);
  assert.equal(reopened.body.order.orderCode, prepared.body.order.orderCode);
  assert.equal(reopened.body.order.totalValue, prepared.body.order.totalValue);
});

test("bloqueia item indisponivel", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      cart: [
        {
          productId: "drink-fanta-laranja",
          quantity: 1
        }
      ]
    })
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "product_unavailable");
});

test("bloqueia combo com bebida indisponivel", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      cart: [
        {
          productId: "combo-individual-orion",
          quantity: 1,
          selectedOptionIds: ["drink-fanta-laranja"]
        }
      ]
    })
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "invalid_combo_option");
});

test("prepara pedido de entrega com taxa validada pela regiao selecionada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
  installViaCepMock();
  installAddressGeoMock();
  const state = configureLocalDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quote = await invokeHandler(deliveryHandler, {
    body: buildDeliveryAddress(area)
  });

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      fulfillment: "delivery",
      payment: {
        method: "dinheiro",
        cashChangeText: "Troco para R$ 60,00"
      },
      delivery: {
        quoteToken: quote.body.quote.token,
        values: buildDeliveryAddress(area)
      }
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.order.isPickup, false);
  assert.equal(response.body.order.deliveryFeeValue, 5);
  assert.equal(response.body.order.totalValue, 54.8);
  assert.equal(response.body.order.deliveryQuote.zone, "zone_5");
  assert.ok(response.body.order.deliveryQuote.deliveryAreaId);
  assert.match(response.body.whatsAppMessage, /Entrega: R\$ 5,00/);
});

test("prepara pedido de entrega com taxa de R$ 5,00 para rua proxima cadastrada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
  installViaCepMock();
  installAddressGeoMock();
  const state = configureLocalDeliveryAreasState();
  const area = findAreaByName(state, "Rua Soldado Lindo Sardagna");

  const quote = await invokeHandler(deliveryHandler, {
    body: buildDeliveryAddress(area)
  });

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      fulfillment: "delivery",
      delivery: {
        quoteToken: quote.body.quote.token,
        values: buildDeliveryAddress(area, {
          street: "R. Soldado Lindo Sardagna"
        })
      }
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.order.deliveryFeeValue, 5);
  assert.equal(response.body.order.deliveryQuote.zone, "zone_5");
  assert.match(response.body.order.addressData.compactAddressLine, /Campo Grande/);
  assert.match(response.body.whatsAppMessage, /Entrega: R\$ 5,00/);
});

test("bloqueia entrega com endereco diferente da taxa validada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
  installViaCepMock();
  installAddressGeoMock();
  const state = configureLocalDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quote = await invokeHandler(deliveryHandler, {
    body: buildDeliveryAddress(area)
  });

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      fulfillment: "delivery",
      delivery: {
        quoteToken: quote.body.quote.token,
        values: buildDeliveryAddress(area, {
          street: "Rua alterada",
          number: "99"
        })
      }
    })
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "delivery_address_mismatch");
});

test("bloqueia pedido quando a rua validada fica bloqueada depois da cotacao", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
  installViaCepMock();
  installAddressGeoMock();
  const state = configureLocalDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quote = await invokeHandler(deliveryHandler, {
    body: buildDeliveryAddress(area)
  });

  const nextState = JSON.parse(JSON.stringify(state));
  const changedArea = nextState.areas.find(candidate => candidate.id === quote.body.deliveryArea.id);
  changedArea.zoneId = "blocked";
  changedArea.updatedAt = "2026-05-21T13:00:00.000Z";
  nextState.updatedAt = changedArea.updatedAt;
  saveDeliveryAreasState(nextState);

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload({
      fulfillment: "delivery",
      delivery: {
        quoteToken: quote.body.quote.token,
        values: buildDeliveryAddress(area)
      }
    })
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "delivery_area_blocked");
});

test("mantem fallback para token na URL quando a persistencia curta nao esta disponivel", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  process.env.VERCEL_ENV = "production";

  const response = await invokeHandler(orderHandler, {
    body: buildBaseOrderPayload()
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body.sharedTicketUrl, /[?&]order=v2\./);
  assert.ok(response.body.sharedTicketUrl.length < 2500);
});
