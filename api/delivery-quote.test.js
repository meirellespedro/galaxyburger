const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("./delivery-quote");

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

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

function mockFetchSequence(sequence) {
  global.fetch = async (url, options = {}) => {
    const next = sequence.shift();

    assert.ok(next, `Unexpected fetch for ${url}`);
    return typeof next === "function" ? next(url, options) : next;
  };
}

function buildGeocodePayload({ route, number, neighborhood, city, state, cep, lat, lng, locationType = "ROOFTOP" }) {
  return {
    status: "OK",
    results: [
      {
        formatted_address: `${route}, ${number} - ${neighborhood}, ${city} - ${state}, ${formatCep(cep)}, Brasil`,
        place_id: `place-${route}-${number}`,
        partial_match: false,
        geometry: {
          location: {
            lat,
            lng
          },
          location_type: locationType
        },
        address_components: [
          { long_name: number, short_name: number, types: ["street_number"] },
          { long_name: route, short_name: route, types: ["route"] },
          { long_name: neighborhood, short_name: neighborhood, types: ["sublocality_level_1", "sublocality", "political"] },
          { long_name: city, short_name: city, types: ["locality", "political"] },
          { long_name: state, short_name: state, types: ["administrative_area_level_1", "political"] },
          { long_name: formatCep(cep), short_name: formatCep(cep), types: ["postal_code"] },
          { long_name: "Brasil", short_name: "BR", types: ["country", "political"] }
        ]
      }
    ]
  };
}

function formatCep(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

test.afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  delete process.env.DELIVERY_QUOTE_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete global.fetch;
});

test("calcula taxa local com Google Maps e rota real", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  mockFetchSequence([
    createJsonResponse(200, {
      cep: "23070-010",
      logradouro: "Rua Embaixador Muniz Gordilho",
      bairro: "Campo Grande",
      localidade: "Rio de Janeiro",
      uf: "RJ"
    }),
    createJsonResponse(200, buildGeocodePayload({
      route: "Rua Embaixador Muniz Gordilho",
      number: "199",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ",
      cep: "23070010",
      lat: -22.9024174,
      lng: -43.5777858
    })),
    createJsonResponse(200, {
      routes: [
        {
          distanceMeters: 2400,
          duration: "600s"
        }
      ]
    })
  ]);

  const response = await invokeHandler({
    body: {
      cep: "23070-010",
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
  assert.equal(response.body.zone, "local");
  assert.equal(response.body.fee, 5);
  assert.equal(response.body.distanceKm, 2.4);
  assert.equal(response.body.routeDistanceKm, 2.4);
  assert.equal(response.body.locationPrecision, "exact");
  assert.equal(response.body.geocoderSource, "google_maps");
  assert.ok(response.body.quote?.token);
});

test("calcula taxa intermediaria de 3 km a 5 km", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  mockFetchSequence([
    createJsonResponse(200, {
      cep: "23070-130",
      logradouro: "Avenida Albardao",
      bairro: "Campo Grande",
      localidade: "Rio de Janeiro",
      uf: "RJ"
    }),
    createJsonResponse(200, buildGeocodePayload({
      route: "Avenida Albardao",
      number: "1",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ",
      cep: "23070130",
      lat: -22.905,
      lng: -43.58
    })),
    createJsonResponse(200, {
      routes: [
        {
          distanceMeters: 4300,
          duration: "900s"
        }
      ]
    })
  ]);

  const response = await invokeHandler({
    body: {
      cep: "23070-130",
      street: "Avenida Albardao",
      number: "1",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.zone, "extended");
  assert.equal(response.body.fee, 10);
  assert.equal(response.body.distanceKm, 4.3);
});

test("bloqueia enderecos acima de 5 km com mensagem definitiva", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";

  mockFetchSequence([
    createJsonResponse(200, {
      cep: "23097-140",
      logradouro: "Avenida Campista",
      bairro: "Campo Grande",
      localidade: "Rio de Janeiro",
      uf: "RJ"
    }),
    createJsonResponse(200, buildGeocodePayload({
      route: "Avenida Campista",
      number: "1",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ",
      cep: "23097140",
      lat: -22.95,
      lng: -43.64
    })),
    createJsonResponse(200, {
      routes: [
        {
          distanceMeters: 5600,
          duration: "1200s"
        }
      ]
    })
  ]);

  const response = await invokeHandler({
    body: {
      cep: "23097-140",
      street: "Avenida Campista",
      number: "1",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "out_of_range");
  assert.equal(response.body.fee, 0);
  assert.equal(response.body.distanceKm, 5.6);
  assert.equal(response.body.message, "No momento n\u00e3o entregamos para essa regi\u00e3o.");
});

test("falha com erro de configuracao quando a chave do Google Maps nao existe", async () => {
  process.env.DELIVERY_QUOTE_SECRET = "test-secret";
  process.env.VERCEL_ENV = "production";

  mockFetchSequence([
    createJsonResponse(200, {
      cep: "23070-010",
      logradouro: "Rua Embaixador Muniz Gordilho",
      bairro: "Campo Grande",
      localidade: "Rio de Janeiro",
      uf: "RJ"
    })
  ]);

  const response = await invokeHandler({
    body: {
      cep: "23070-010",
      street: "Rua Embaixador Muniz Gordilho",
      number: "200",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "missing_maps_api_key");
});
