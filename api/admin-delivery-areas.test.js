const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const adminLoginHandler = require("./admin-login");
const adminDeliveryAreasHandler = require("./admin-delivery-areas");
const publicDeliveryAreasHandler = require("./delivery-areas");
const { buildDefaultDeliveryAreasState } = require("./_delivery-areas-store");

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

function configureDeliveryAreasFile() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "gb-admin-delivery-areas-"));
  const filePath = path.join(tempDirectory, "delivery-areas.json");
  const state = buildDefaultDeliveryAreasState("2026-05-21T12:00:00.000Z");
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  tempDirectories.push(tempDirectory);
  process.env.DELIVERY_AREAS_FILE_PATH = filePath;
  process.env.DELIVERY_AREAS_STORAGE_MODE = "file";
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

test.afterEach(() => {
  delete process.env.ADMIN_PANEL_PASSWORD;
  delete process.env.ADMIN_PANEL_SECRET;
  delete process.env.DELIVERY_AREAS_FILE_PATH;
  delete process.env.DELIVERY_AREAS_STORAGE_MODE;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;

  while (tempDirectories.length) {
    const directory = tempDirectories.pop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("painel exige login antes de listar regioes", async () => {
  configureDeliveryAreasFile();

  const response = await invokeHandler(adminDeliveryAreasHandler);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "admin_unauthorized");
});

test("painel cria, atualiza e remove regioes com persistencia publica", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  configureDeliveryAreasFile();
  const cookie = await loginAdmin();

  const created = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: "Parque Laranja",
      zoneId: "zone_10",
      note: "Entrega teste."
    }
  });

  assert.equal(created.statusCode, 200);
  assert.equal(created.body.ok, true);
  assert.equal(Array.isArray(created.body.deliveryAreas.zones), true);
  const createdArea = created.body.deliveryAreas.areas.find(area => area.name === "Parque Laranja");
  assert.ok(createdArea);
  assert.equal(createdArea.zoneId, "zone_10");
  assert.equal(createdArea.fee, 10);

  const updated = await invokeHandler(adminDeliveryAreasHandler, {
    method: "PUT",
    headers: {
      cookie
    },
    body: {
      id: createdArea.id,
      zoneId: "pickup_only",
      note: "Retirada liberada."
    }
  });

  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.ok, true);

  const publicListAfterUpdate = await invokeHandler(publicDeliveryAreasHandler, {
    method: "GET"
  });
  const updatedArea = publicListAfterUpdate.body.areas.find(area => area.id === createdArea.id);

  assert.equal(publicListAfterUpdate.statusCode, 200);
  assert.equal(updatedArea.status, "pickup_only");
  assert.equal(updatedArea.pickupOnly, true);
  assert.equal(updatedArea.zoneId, "pickup_only");
  assert.equal(updatedArea.fee, 0);

  const removed = await invokeHandler(adminDeliveryAreasHandler, {
    method: "DELETE",
    headers: {
      cookie
    },
    body: {
      id: createdArea.id
    }
  });

  assert.equal(removed.statusCode, 200);
  assert.equal(removed.body.ok, true);

  const publicListAfterDelete = await invokeHandler(publicDeliveryAreasHandler, {
    method: "GET"
  });
  assert.equal(
    publicListAfterDelete.body.areas.some(area => area.id === createdArea.id),
    false
  );
});

test("normaliza nome para impedir regioes duplicadas com escrita diferente", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  configureDeliveryAreasFile();
  const cookie = await loginAdmin();

  const first = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: "Campo-Grande Vip",
      zoneId: "zone_5"
    }
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.ok, true);

  const duplicate = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: " campo grande vip ",
      zoneId: "blocked"
    }
  });

  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.ok, false);
  assert.equal(duplicate.body.code, "delivery_area_duplicate_name");
});

test("normaliza abreviacoes para impedir rua duplicada com escrita curta", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  configureDeliveryAreasFile();
  const cookie = await loginAdmin();

  const duplicate = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: "R. Augusta Candiani",
      zoneId: "zone_10"
    }
  });

  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.ok, false);
  assert.equal(duplicate.body.code, "delivery_area_duplicate_name");
});

test("bloqueia taxa fora da regra fixa ao receber payload legado com entrega ativa", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  configureDeliveryAreasFile();
  const cookie = await loginAdmin();

  const response = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: "Bairro Fora da Regra",
      fee: 8,
      status: "active"
    }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "delivery_area_invalid_fee_policy");
});

test("em producao sem persistencia configurada retorna erro amigavel", async () => {
  process.env.ADMIN_PANEL_PASSWORD = "painel-seguro";
  process.env.ADMIN_PANEL_SECRET = "painel-secret";
  process.env.VERCEL_ENV = "production";
  const cookie = await loginAdmin();

  const response = await invokeHandler(adminDeliveryAreasHandler, {
    method: "POST",
    headers: {
      cookie
    },
    body: {
      name: "Bairro Sem Storage",
      zoneId: "zone_10"
    }
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "delivery_areas_storage_not_configured");
  assert.doesNotMatch(String(response.body.message || ""), /EROFS|read-only/i);
});
