(function attachStoreConfig(root, factory) {
  const config = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }

  if (root && typeof root === "object") {
    root.GALAXY_STORE_CONFIG = config;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createStoreConfig() {
  const config = {
    brand: Object.freeze({
      name: "Galaxy Burger"
    }),
    store: Object.freeze({
      whatsapp: "5521995578652",
      iFoodUrl: "https://www.ifood.com.br/delivery/rio-de-janeiro-rj/galaxy-burger-199-campo-grande/fe3716f9-fab7-4b6b-9e7a-09f0ccff22d1",
      publicOrderTicketBaseUrl: "https://galaxyburger.vercel.app/",
      address: Object.freeze({
        street: "Rua Embaixador Muniz Gordilho",
        number: "199",
        neighborhood: "Campo Grande",
        city: "Rio de Janeiro",
        state: "RJ",
        cep: "23070010"
      })
    }),
    pix: Object.freeze({
      key: "66.219.861/0001-73",
      beneficiaryName: "Sulen Ferreira de Carvalho de Souza"
    }),
    checkout: Object.freeze({
      minimumOrderAmount: 20,
      timeZone: "America/Sao_Paulo",
      scheduleMode: "live",
      temporaryClosure: Object.freeze({
        enabled: true,
        reopenAt: "2026-05-23T19:00:00-03:00"
      }),
      hours: Object.freeze({
        0: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        1: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        2: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        3: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        4: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        5: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 }),
        6: Object.freeze({ openMinutes: 19 * 60, closeMinutes: 23 * 60 + 59 })
      }),
      paymentMethods: Object.freeze([
        "pix",
        "dinheiro",
        "cartao de credito",
        "cartao de debito"
      ])
    })
  };

  return Object.freeze(config);
});
