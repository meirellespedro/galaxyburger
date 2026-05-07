# Galaxy Burger

Site estatico com checkout via WhatsApp e taxa de entrega manual por regiao.

## Checkout atual

- `Entrega`: endereco preenchido manualmente no checkout.
- `CEP`: opcional, usado apenas para autocomplete simples via ViaCEP.
- `Taxa por regiao`:
  - `Campo Grande`: `R$ 5,00`
  - `Outros bairros atendidos ate 5 km`: `R$ 10,00`
  - `Acima de 5 km`: entrega indisponivel
- `Retirada`: sem taxa.

## Arquivos principais

- [index.html](/c:/Users/pmeir/Desktop/hamburgeria/index.html)
- [style.css](/c:/Users/pmeir/Desktop/hamburgeria/style.css)
- [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js)

## Ajustes rapidos

- WhatsApp da loja: `STORE_WHATSAPP` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:4)
- Chave Pix: `PIX_KEY` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:3)

## Publicacao

Pode ser publicado como site estatico, sem backend.
