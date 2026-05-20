const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("./delivery-quote");

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

function buildAddress(overrides = {}) {
  return {
    cep: "23070-010",
    street: "Rua Embaixador Muniz Gordilho",
    number: "199",
    neighborhood: "Campo Grande",
    city: "Rio de Janeiro",
    state: "RJ",
    ...overrides
  };
}

test.afterEach(() => {
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
});

test("retorna status online quando chamado sem token", async () => {
  const response = await invokeHandler({
    method: "GET"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "online");
});

test("calcula taxa local pela rua cadastrada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress()
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "local");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.distanceKm, 0);
  assert.equal(response.body.routeDistanceKm, 0);
  assert.equal(response.body.locationPrecision, "manual_zone");
  assert.equal(response.body.geocoderSource, "manual_zone_registry");
  assert.equal(response.body.message, "Entrega dispon\u00edvel para sua regi\u00e3o. Taxa: R$ 5,00.");
  assert.ok(response.body.quote?.token);
});

test("calcula taxa intermediaria pelo bairro com normalizacao de texto", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      street: "Rua sem cadastro",
      number: "45",
      neighborhood: "  campo-grande  ",
      state: "rj"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "extended");
  assert.equal(response.body.fee, 10);
  assert.equal(response.body.message, "Entrega dispon\u00edvel para sua regi\u00e3o. Taxa: R$ 10,00.");
});

test("bloqueia endereco fora da cobertura por rua bloqueada", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      street: "Avenida Campista",
      number: "1"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "out_of_range");
  assert.equal(response.body.zone, "out_of_range");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.message, "No momento n\u00e3o entregamos nesse endere\u00e7o. Voc\u00ea pode escolher retirada no local.");
});

test("rejeita endereco sem numero valido", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      number: "s/n"
    })
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "invalid_house_number");
});

test("verifica token da cotacao com addressKey compativel", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const calculation = await invokeHandler({
    body: buildAddress()
  });

  const verification = await invokeHandler({
    method: "GET",
    query: {
      token: calculation.body.quote.token,
      addressKey: "rua embaixador muniz gordilho|199|campo grande|rio de janeiro|RJ"
    }
  });

  assert.equal(verification.statusCode, 200);
  assert.equal(verification.body.ok, true);
  assert.equal(verification.body.status, "verified");
  assert.equal(verification.body.quote.zone, "local");
  assert.equal(verification.body.quote.fee, 5);
});

test("falha em ambiente publicado sem DELIVERY_QUOTE_SECRET", async () => {
  process.env.VERCEL_ENV = "production";

  const response = await invokeHandler({
    body: buildAddress()
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "missing_secret");
});
