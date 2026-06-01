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
      coordinates: Object.freeze({
        latitude: -22.9049152,
        longitude: -43.5780493
      }),
      country: "Brasil"
    }),
    serviceArea: Object.freeze({
      neighborhood: "Campo Grande",
      city: "Rio de Janeiro",
      state: "RJ"
    }),
    normalization: Object.freeze({
      abbreviations: Object.freeze({
        al: "alameda",
        av: "avenida",
        cg: "campo grande",
        estr: "estrada",
        jd: "jardim",
        pc: "praca",
        pr: "praia",
        r: "rua",
        rod: "rodovia",
        sta: "santa",
        sto: "santo",
        trav: "travessa",
        tv: "travessa",
        vl: "vila"
      })
    }),
    messages: Object.freeze({
      local: "Entrega disponível para sua região. Taxa: R$ 5,00.",
      extended: "Entrega disponível para sua região. Taxa: R$ 10,00.",
      outOfRange: "No momento não entregamos nessa região. Você pode escolher retirada no local."
    }),
    metadata: Object.freeze({
      locationPrecision: "manual_zone",
      geocoderSource: "manual_zone_registry"
    }),
    distanceRules: Object.freeze({
      strategy: "air_distance_open_geocoder",
      localMaxKm: 2.9,
      extendedMaxKm: 5,
      precisionDecimals: 1
    }),
    priorityAddressZones: Object.freeze({
      zone_5: Object.freeze([
        "rua augusta candiani",
        "augusta candiani",
        "rua soldado lindo sardagna",
        "soldado lindo sardagna",
        "rua soldado lino sardagna",
        "soldado lino sardagna"
      ]),
      zone_10: Object.freeze([])
    }),
    blockedRules: Object.freeze([
      Object.freeze({
        name: "Região fora da área",
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
        id: "zone_5",
        value: "zone_5",
        name: "Até 2,9 km",
        fee: 5,
        maxDistanceKm: 2.9,
        label: "Até 2,9 km da base - R$ 5,00",
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
          "rua embaixador muniz cordilho",
          "rua augusta candiani",
          "rua almeida lisboa",
          "rua anfrisio fialho",
          "rua aratiba",
          "rua arcilio papini",
          "rua barao do rio verde",
          "boulevard carioca",
          "rua carlos werneck",
          "rua cordilheira",
          "rua gramado",
          "rua guaraciaba",
          "rua iraci doyle",
          "rua jocelin fraga",
          "rua jose piragibe",
          "rua levino fanzeres",
          "rua major armando de sousa melo",
          "rua maria francisca",
          "rua pampeiro",
          "rua ponche verde",
          "rua professor ramiro de matos",
          "rua rio pardo",
          "rua soldado lindo sardagna",
          "rua soldado lino sardagna",
          "rua tabai",
          "rua toroqua",
          "rua tupacerata",
          "rua umbu",
          "rua varzea alegre",
          "rua wolf klabin",
          "rua ana barcelos",
          "avenida manuel caldeira de alvarenga",
          "avenida albardao",
          "rua campo grande"
        ])
      }),
      Object.freeze({
        id: "zone_10",
        value: "zone_10",
        name: "De 3 km até 5 km",
        fee: 10,
        minDistanceKm: 3,
        maxDistanceKm: 5,
        label: "De 3 km até 5 km da base - R$ 10,00",
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
