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

test("prepara pedido de entrega com taxa validada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
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
  assert.equal(response.body.order.deliveryQuote.zone, "delivery_area");
  assert.equal(response.body.order.deliveryQuote.deliveryAreaId, area.id);
});

test("bloqueia entrega com endereco diferente da taxa validada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
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

test("bloqueia pedido quando a taxa do bairro muda depois da validacao", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  configureLocalOrderTicketStorage();
  const state = configureLocalDeliveryAreasState();
  const area = findAreaByName(state, "Vila Nova");

  const quote = await invokeHandler(deliveryHandler, {
    body: buildDeliveryAddress(area)
  });

  const nextState = JSON.parse(JSON.stringify(state));
  const changedArea = findAreaByName(nextState, "Vila Nova");
  changedArea.fee = 7;
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
  assert.equal(response.body.code, "delivery_area_changed");
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
