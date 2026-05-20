(function attachDeliveryConfig(root, factory) {
  const config = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }

  if (root && typeof root === "object") {
    root.GALAXY_DELIVERY_CONFIG = config;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDeliveryConfig() {
  const config = {
    store: Object.freeze({
      street: "Rua Embaixador Muniz Gordilho",
      number: "199",
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ",
      cep: "23070010",
      country: "Brasil"
    }),
    serviceArea: Object.freeze({
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }),
    normalization: Object.freeze({
      abbreviations: Object.freeze({
        cg: "campo grande",
        jd: "jardim",
        sta: "santa",
        sto: "santo",
        vl: "vila"
      })
    }),
    messages: Object.freeze({
      local: "Entrega dispon\u00edvel para sua regi\u00e3o. Taxa: R$ 5,00.",
      extended: "Entrega dispon\u00edvel para sua regi\u00e3o. Taxa: R$ 10,00.",
      outOfRange: "No momento n\u00e3o entregamos nessa regi\u00e3o. Voc\u00ea pode escolher retirada no local."
    }),
    metadata: Object.freeze({
      locationPrecision: "manual_zone",
      geocoderSource: "manual_zone_registry"
    }),
    blockedRules: Object.freeze([
      Object.freeze({
        name: "Regiao fora da area",
        neighborhoods: Object.freeze([
          "santa cruz",
          "paciencia",
          "sepetiba",
          "guaratiba",
          "pedra de guaratiba",
          "barra de guaratiba",
          "ilha de guaratiba"
        ]),
        streetHints: Object.freeze([
          "avenida campista",
          "avenida do nortista",
          "avenida do catarinense",
          "avenida canal",
          "avenida canal pista 1",
          "avenida canal pista 2",
          "avenida brasil",
          "avenida belmiro valverde",
          "avenida glicinia",
          "avenida alhambra"
        ])
      })
    ]),
    zones: Object.freeze([
      Object.freeze({
        value: "local",
        name: "Regi\u00e3o pr\u00f3xima",
        fee: 5,
        maxDistanceKm: 3,
        label: "At\u00e9 3 km da base - R$ 5,00",
        neighborhoods: Object.freeze([
          "centro de campo grande",
          "campo grande centro",
          "mendanha",
          "sao basilio",
          "sao claudio",
          "vila nova",
          "vila nova campo grande"
        ]),
        streetHints: Object.freeze([
          "rua embaixador muniz gordilho",
          "rua jocelin fraga",
          "rua soldado lindo sardagna",
          "rua soldado lino sardagna",
          "rua toroqua",
          "rua varzea alegre",
          "rua ana barcelos",
          "avenida manuel caldeira de alvarenga",
          "avenida albardao",
          "rua campo grande"
        ])
      }),
      Object.freeze({
        value: "extended",
        name: "Regi\u00e3o intermedi\u00e1ria",
        fee: 10,
        maxDistanceKm: 5,
        label: "De 3 km at\u00e9 5 km da base - R$ 10,00",
        neighborhoods: Object.freeze([
          "campo grande",
          "inhoaiba",
          "cosmos",
          "senador vasconcelos",
          "santissimo"
        ]),
        streetHints: Object.freeze([
          "rua ramalho novo",
          "rua lucelia",
          "avenida cesario de melo",
          "avenida dom sebastiao i",
          "avenida farroupilha",
          "avenida andre vesalio"
        ])
      })
    ])
  };

  return Object.freeze(config);
});
