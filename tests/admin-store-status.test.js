const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const adminLoginHandler = require("../api/admin-login");
const adminStoreStatusHandler = require("../api/admin-store-status");
const publicStoreStatusHandler = require("../api/store-status");
const orderTicketHandler = require("../api/order-ticket");
const { buildDefaultStoreStatusState } = require("../lib/_store-status-store");

const tempDirectories = [];

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

function configureStoreStatusFile(initialOverrideMode = "auto") {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-admin-store-status-"));
  const filePath = path.join(tempDirectory, "store-status.json");
  const state = buildDefaultStoreStatusState("2026-05-25T12:00:00.000Z");
  state.overrideMode = initialOverrideMode;
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  tempDirectories.push(tempDirectory);
  process.env.STORE_STATUS_FILE_PATH = filePath;
  process.env.STORE_STATUS_STORAGE_MODE = "file";
  return filePath;
}

async function loginAdmin() {
  const login = await invokeHandler(adminLoginHandler, {
    method: "POST",
    body: {
      password: "painel-seguro"
    }
  });

  assert.equal(login.statusCode, 200);
  assert.equal(login.body.ok, true);
  return String(login.headers["Set-Cookie"] || "");
}

function buildBaseOrderPayload(overrides = {}) {
  return {
    customer: {
      name: "Josemar",
      phone: "(21) 99999-9999"
    },
    fulfillment: "pickup",
    payment: {
      method: "pix",
      cashChangeText: ""
    },
    notes: "",
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
  delete process.env.ORDER_TICKET_SECRET;
  delete process.env.STORE_STATUS_FILE_PATH;
  delete process.env.STORE_STATUS_STORAGE_MODE;
  delete process.env.STORE_STATUS_BLOB_PATHNAME;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;

  while (tempDirectories.length) {
    const directory = tempDirectories.pop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("painel exige login antes de consultar o status operacional", async () => {
  configureStoreStatusFile();

  const response = await invokeHandler(adminStoreStatusHandler);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "admin_unauthorized");
});

test("painel atualiza o modo manual e o endpoint publico reflete a mudanca", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.ADMIN_PANEL_SECRET = "painel-secret";
  configureStoreStatusFile();
  const cookie = await loginAdmin();

  const closed = await invokeHandler(adminStoreStatusHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      overrideMode: "force_closed"
    }
  });

  assert.equal(closed.statusCode, 200);
  assert.equal(closed.body.ok, true);
  assert.equal(closed.body.storeStatus.overrideMode, "force_closed");

  const publicClosed = await invokeHandler(publicStoreStatusHandler, {
    method: "GET"
  });

  assert.equal(publicClosed.statusCode, 200);
  assert.equal(publicClosed.body.ok, true);
  assert.equal(publicClosed.body.overrideMode, "force_closed");

  const reopened = await invokeHandler(adminStoreStatusHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      overrideMode: "force_open"
    }
  });

  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.body.ok, true);
  assert.equal(reopened.body.storeStatus.overrideMode, "force_open");
});

test("pedido online e bloqueado quando a loja esta fechada manualmente", async () => {
  process.env.ORDER_TICKET_SECRET = "order-secret";
  configureStoreStatusFile("force_closed");

  const response = await invokeHandler(orderTicketHandler, {
    method: "POST",
    body: buildBaseOrderPayload()
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "store_orders_closed");
});
