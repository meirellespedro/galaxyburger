const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("./delivery-quote");
const deliveryConfig = require("../delivery-config");

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

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const TEXT_DISPLAY_VARIANTS = Object.freeze({
  "sao basilio": "Sao Basilio",
  "sao claudio": "Sao Claudio",
  "santissimo": "Santissimo",
  "inhoaiba": "Inhoaiba",
  "avenida cesario de melo": "Avenida Cesario de Melo",
  "avenida dom sebastiao i": "Avenida Dom Sebastiao I",
  "avenida manuel caldeira de alvarenga": "Avenida Manuel Caldeira de Alvarenga",
  "avenida andre vesalio": "Avenida Andre Vesalio",
  "rua varzea alegre": "Rua Varzea Alegre"
});

function buildTextVariations(value, { isStreet = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  const displayValue = TEXT_DISPLAY_VARIANTS[normalized] || toTitleCase(normalized);
  const variations = new Set([
    normalized,
    displayValue,
    displayValue.toUpperCase(),
    `  ${displayValue}  `,
    displayValue.replace(/\s+/g, "-")
  ]);

  if (/^vila\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Vila\b/i, "Vl."));
  }

  if (/^santa\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Santa\b/i, "Sta."));
  }

  if (/^santo\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Santo\b/i, "Sto."));
  }

  if (/^jardim\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Jardim\b/i, "Jd."));
  }

  if (/\bcampo grande\b/i.test(displayValue)) {
    variations.add(displayValue.replace(/campo grande/i, "Campo-Grande"));
  }

  if (isStreet && /^Rua\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Rua\b/i, "R."));
  }

  if (isStreet && /^Avenida\s+/i.test(displayValue)) {
    variations.add(displayValue.replace(/^Avenida\b/i, "Av."));
  }

  return [...variations]
    .map(candidate => candidate.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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

test("classifica Rua Soldado Lindo Sardagna como regiao local", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      cep: "23080-710",
      street: "Rua Soldado Lindo Sardagna",
      number: "173"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "local");
  assert.equal(response.body.fee, 5);
});

test("reconhece bairro local com abreviacao comum", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      street: "Rua sem cadastro",
      number: "45",
      neighborhood: "Vl. Nova"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "local");
  assert.equal(response.body.fee, 5);
});

test("cobre todas as regras cadastradas de Campo Grande com variacoes de escrita", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  for (const zone of deliveryConfig.zones) {
    for (const neighborhood of zone.neighborhoods) {
      for (const neighborhoodVariation of buildTextVariations(neighborhood)) {
        const response = await invokeHandler({
          body: buildAddress({
            street: "Rua sem cadastro",
            number: "45",
            neighborhood: neighborhoodVariation
          })
        });

        assert.equal(
          response.body.zone,
          zone.value,
          `Bairro "${neighborhoodVariation}" deveria cair na zona ${zone.value}`
        );
        assert.equal(
          response.body.fee,
          zone.fee,
          `Bairro "${neighborhoodVariation}" deveria cobrar ${zone.fee}`
        );
      }
    }

    for (const streetHint of zone.streetHints) {
      for (const streetVariation of buildTextVariations(streetHint, { isStreet: true })) {
        const response = await invokeHandler({
          body: buildAddress({
            street: streetVariation,
            number: "45",
            neighborhood: "Campo Grande"
          })
        });

        assert.equal(
          response.body.zone,
          zone.value,
          `Rua "${streetVariation}" deveria cair na zona ${zone.value}`
        );
        assert.equal(
          response.body.fee,
          zone.fee,
          `Rua "${streetVariation}" deveria cobrar ${zone.fee}`
        );
      }
    }
  }

  for (const blockedRule of deliveryConfig.blockedRules) {
    for (const neighborhood of blockedRule.neighborhoods) {
      for (const neighborhoodVariation of buildTextVariations(neighborhood)) {
        const response = await invokeHandler({
          body: buildAddress({
            street: "Rua sem cadastro",
            number: "45",
            neighborhood: neighborhoodVariation
          })
        });

        assert.equal(
          response.body.status,
          "out_of_range",
          `Bairro bloqueado "${neighborhoodVariation}" deveria ficar fora da area`
        );
        assert.equal(response.body.fee, 0);
      }
    }

    for (const streetHint of blockedRule.streetHints) {
      for (const streetVariation of buildTextVariations(streetHint, { isStreet: true })) {
        const response = await invokeHandler({
          body: buildAddress({
            street: streetVariation,
            number: "45",
            neighborhood: "Campo Grande"
          })
        });

        assert.equal(
          response.body.status,
          "out_of_range",
          `Rua bloqueada "${streetVariation}" deveria ficar fora da area`
        );
        assert.equal(response.body.fee, 0);
      }
    }
  }
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
  assert.equal(response.body.message, "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local.");
});

test("bloqueia cidade fora da area atendida", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  const response = await invokeHandler({
    body: buildAddress({
      city: "Nova Igua\u00e7u",
      state: "RJ"
    })
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "out_of_range");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.message, "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local.");
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
