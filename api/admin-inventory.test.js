const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const adminLoginHandler = require("./admin-login");
const adminInventoryHandler = require("./admin-inventory");
const inventoryStatusHandler = require("./inventory-status");
const orderHandler = require("./order-ticket");

async function invokeHandler(handler, {
  method = "GET",
  body = {},
  query = {},
  headers = {}
} = {}) {
  const req = {
    method,
    body,
    query,
    headers: {
      host: "galaxyburger.vercel.app",
      "x-forwarded-proto": "https",
      ...headers
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

function withTempInventoryFile() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-inventory-"));
  return path.join(tempDirectory, "inventory-status.json");
}

function buildPickupOrderPayload(overrides = {}) {
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
    cart: [
      {
        productId: "burger-poro-cosmico",
        quantity: 1
      }
    ],
    ...overrides
  };
}

test.afterEach(() => {
  delete process.env.ADMIN_PANEL_PASSWORD;
  delete process.env.ADMIN_PANEL_SECRET;
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.ORDER_TICKET_SECRET;
  delete process.env.INVENTORY_STATUS_FILE_PATH;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
});

test("painel exige login antes de listar o estoque", async () => {
  process.env.INVENTORY_STATUS_FILE_PATH = withTempInventoryFile();

  const response = await invokeHandler(adminInventoryHandler);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "admin_unauthorized");
});

test("login valida senha e libera consulta do estoque", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.INVENTORY_STATUS_FILE_PATH = withTempInventoryFile();

  const login = await invokeHandler(adminLoginHandler, {
    method: "POST",
    body: {
      password: "painel-seguro"
    }
  });

  assert.equal(login.statusCode, 200);
  assert.equal(login.body.ok, true);
  assert.match(String(login.headers["Set-Cookie"] || ""), /gb_admin_session=/);

  const inventory = await invokeHandler(adminInventoryHandler, {
    headers: {
      cookie: String(login.headers["Set-Cookie"] || "")
    }
  });

  assert.equal(inventory.statusCode, 200);
  assert.equal(inventory.body.ok, true);
  assert.ok(Array.isArray(inventory.body.inventory.products));
  assert.ok(inventory.body.inventory.products.length > 0);
});

test("alteracao do painel persiste e o cardapio publico le o novo status", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.INVENTORY_STATUS_FILE_PATH = withTempInventoryFile();

  const login = await invokeHandler(adminLoginHandler, {
    method: "POST",
    body: {
      password: "painel-seguro"
    }
  });

  const updated = await invokeHandler(adminInventoryHandler, {
    method: "POST",
    headers: {
      cookie: String(login.headers["Set-Cookie"] || "")
    },
    body: {
      productId: "burger-poro-cosmico",
      available: false
    }
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.ok, true);

  const inventoryStatus = await invokeHandler(inventoryStatusHandler);
  const product = inventoryStatus.body.products.find(item => item.id === "burger-poro-cosmico");

  assert.equal(inventoryStatus.statusCode, 200);
  assert.equal(product.available, false);
});

test("checkout rejeita produto marcado como esgotado no painel", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  process.env.INVENTORY_STATUS_FILE_PATH = withTempInventoryFile();

  const login = await invokeHandler(adminLoginHandler, {
    method: "POST",
    body: {
      password: "painel-seguro"
    }
  });

  await invokeHandler(adminInventoryHandler, {
    method: "POST",
    headers: {
      cookie: String(login.headers["Set-Cookie"] || "")
    },
    body: {
      productId: "burger-poro-cosmico",
      available: false
    }
  });

  const order = await invokeHandler(orderHandler, {
    method: "POST",
    body: buildPickupOrderPayload()
  });

  assert.equal(order.statusCode, 409);
  assert.equal(order.body.ok, false);
  assert.equal(order.body.code, "product_unavailable");
});

test("em producao sem armazenamento persistente configurado retorna erro amigavel no admin", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.ADMIN_PANEL_SECRET = "painel-secret";
  process.env.VERCEL_ENV = "production";

  const login = await invokeHandler(adminLoginHandler, {
    method: "POST",
    body: {
      password: "painel-seguro"
    }
  });

  const response = await invokeHandler(adminInventoryHandler, {
    method: "POST",
    headers: {
      cookie: String(login.headers["Set-Cookie"] || "")
    },
    body: {
      productId: "burger-poro-cosmico",
      available: false
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "inventory_storage_not_configured");
  assert.doesNotMatch(String(response.body.message || ""), /EROFS|read-only/i);
});
