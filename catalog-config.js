(function attachCatalogConfig(root, factory) {
  const config = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }

  if (root && typeof root === "object") {
    root.GALAXY_CATALOG_CONFIG = config;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatalogConfig() {
  const products = [
    {
      id: "burger-poro-cosmico",
      category: "burger",
      name: "Poró cósmico ( TOP 1, O MAIS PEDIDO )",
      aliases: ["poro cosmico", "poro cósmico"],
      price: 24.9,
      available: true
    },
    {
      id: "burger-saturno",
      category: "burger",
      name: "Saturno",
      price: 34.9,
      available: true
    },
    {
      id: "burger-orion",
      category: "burger",
      name: "ORION",
      aliases: ["orion"],
      price: 19.9,
      available: true
    },
    {
      id: "burger-alfa-tasty",
      category: "burger",
      name: "Alfa Tasty",
      price: 19.9,
      available: true
    },
    {
      id: "burger-et-da-casa",
      category: "burger",
      name: "ET da casa",
      aliases: ["et da casa"],
      price: 24.9,
      available: true
    },
    {
      id: "burger-baconstelacao",
      category: "burger",
      name: "Baconstelação",
      aliases: ["baconstelacao"],
      price: 19.9,
      available: true
    },
    {
      id: "burger-picles-das-galaxias",
      category: "burger",
      name: "Picles das galáxias",
      aliases: ["picles das galaxias"],
      price: 19.9,
      available: true
    },
    {
      id: "burger-estrela-classica",
      category: "burger",
      name: "Estrela clássica",
      aliases: ["estrela classica"],
      price: 19.9,
      available: true
    },
    {
      id: "burger-venus-salada",
      category: "burger",
      name: "Vênus salada",
      aliases: ["venus salada"],
      price: 19.9,
      available: true
    },
    {
      id: "burger-ovini-smash",
      category: "burger",
      name: "Ovini Smash 2.0",
      price: 24.9,
      available: true
    },
    {
      id: "burger-cheddar-estrelar",
      category: "burger",
      name: "Cheddar Estrelar",
      price: 24.9,
      available: true
    },
    {
      id: "burger-cometa-de-fogo",
      category: "burger",
      name: "Cometa de fogo",
      price: 22.9,
      available: true
    },
    {
      id: "combo-individual-orion",
      category: "combo",
      name: "Combo individual Orion",
      price: 26.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 1
      })
    },
    {
      id: "combo-individual-saturno",
      category: "combo",
      name: "Combo individual Saturno",
      price: 39.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 1
      })
    },
    {
      id: "combo-venus-casal",
      category: "combo",
      name: "Combo Vênus casal",
      aliases: ["combo venus casal"],
      price: 56.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 2
      })
    },
    {
      id: "combo-classico",
      category: "combo",
      name: "Combo clássico",
      aliases: ["combo classico"],
      price: 26.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 1
      })
    },
    {
      id: "combo-orion-familia",
      category: "combo",
      name: "Combo Orion família",
      aliases: ["combo orion familia"],
      price: 119,
      available: true,
      combo: Object.freeze({
        drinksCount: 4
      })
    },
    {
      id: "combo-aliens",
      category: "combo",
      name: "Combo Aliens",
      price: 117.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 4
      })
    },
    {
      id: "combo-kids",
      category: "combo",
      name: "Combo Kids",
      price: 19.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 1,
        optionIds: Object.freeze(["drink-guaracamp-285"])
      })
    },
    {
      id: "combo-galaxy",
      category: "combo",
      name: "Combo Galaxy",
      price: 89.9,
      available: true,
      combo: Object.freeze({
        drinksCount: 3
      })
    },
    {
      id: "side-onion-crocante",
      category: "side",
      name: "15 Onions crocante",
      price: 15,
      available: true
    },
    {
      id: "side-batata-grande",
      category: "side",
      name: "Batata Grande",
      price: 15,
      available: true
    },
    {
      id: "side-batata-grande-catupiry",
      category: "side",
      name: "Batata Grande (catupiry)",
      price: 24.9,
      available: true
    },
    {
      id: "side-batata-grande-cheddar",
      category: "side",
      name: "Batata Grande (cheddar)",
      price: 24.9,
      available: false
    },
    {
      id: "side-batata-pequena",
      category: "side",
      name: "Batata pequena",
      price: 5,
      available: true
    },
    {
      id: "side-nuggets",
      category: "side",
      name: "Nuggets",
      price: 5,
      available: false
    },
    {
      id: "drink-coca-cola-350",
      category: "drink",
      name: "Coca-Cola Comum 350ML",
      price: 6.9,
      available: true,
      comboEligible: true
    },
    {
      id: "drink-coca-cola-zero-350",
      category: "drink",
      name: "Coca-Cola Zero 350 ml",
      price: 6.9,
      available: true,
      comboEligible: true
    },
    {
      id: "drink-pepsi-350",
      category: "drink",
      name: "Pepsi lata 350ml",
      price: 5.9,
      available: true,
      comboEligible: true
    },
    {
      id: "drink-pepsi-black-350",
      category: "drink",
      name: "Pepsi Black lata 350ml",
      price: 6.9,
      available: false,
      comboEligible: true
    },
    {
      id: "drink-fanta-laranja",
      category: "drink",
      name: "Fanta Laranja",
      price: 5.9,
      available: false,
      comboEligible: true
    },
    {
      id: "drink-guarana-350",
      category: "drink",
      name: "Guaraná lata 350ml",
      aliases: ["guaran  lata 350ml"],
      price: 6.9,
      available: true,
      comboEligible: true
    },
    {
      id: "drink-sprite-350",
      category: "drink",
      name: "Sprite lata 350ml",
      price: 5.9,
      available: false,
      comboEligible: true
    },
    {
      id: "drink-fanta-uva",
      category: "drink",
      name: "Fanta uva",
      price: 5.9,
      available: false,
      comboEligible: true
    },
    {
      id: "drink-guaracamp-285",
      category: "drink",
      name: "Guaracamp copo 285ml",
      price: 2.5,
      available: true,
      comboEligible: true
    },
    {
      id: "extra-farofa-bacon",
      category: "extra",
      name: "Farofa de Bacon",
      price: 4,
      available: true
    },
    {
      id: "extra-carne",
      category: "extra",
      name: "Carne",
      price: 10,
      available: true
    },
    {
      id: "extra-bacon",
      category: "extra",
      name: "Bacon",
      price: 4,
      available: true
    },
    {
      id: "extra-cheddar",
      category: "extra",
      name: "Cheddar",
      price: 3,
      available: true
    },
    {
      id: "extra-mussarela",
      category: "extra",
      name: "Mussarela",
      price: 3,
      available: true
    },
    {
      id: "extra-molho-billy-jack",
      category: "extra",
      name: "Molho Billy Jack",
      price: 3,
      available: true
    },
    {
      id: "extra-maionese-verde",
      category: "extra",
      name: "Maionese Verde",
      price: 3,
      available: true
    },
    {
      id: "extra-molho-tasty",
      category: "extra",
      name: "Molho Tasty",
      price: 3,
      available: true
    },
    {
      id: "extra-molho-bacon",
      category: "extra",
      name: "Molho de Bacon",
      price: 3,
      available: true
    },
    {
      id: "extra-geleia-pimenta",
      category: "extra",
      name: "Geleia de pimenta",
      price: 5,
      available: true
    }
  ];

  return Object.freeze({
    version: 1,
    products: Object.freeze(products.map(product => Object.freeze(product)))
  });
});
