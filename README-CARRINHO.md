# Galaxy Burger

Site estatico com checkout via WhatsApp e taxa de entrega validada por uma funcao serverless da Vercel.

## Checkout atual

- `Entrega`: endereco preenchido no checkout e validado automaticamente pela API `/api/delivery-quote`.
- `CEP`: obrigatorio para validar a entrega.
- `Taxa por distancia`:
  - `Ate 3 km da base`: `R$ 5,00`
  - `De 3 km ate 5 km da base`: `R$ 10,00`
  - `Acima de 5 km`: entrega indisponivel
- `Retirada`: sem taxa.
- `Seguranca`: a taxa nao e mais escolhida no navegador; o servidor valida CEP, rua e distancia antes de liberar o pedido.

## Arquivos principais

- [index.html](/c:/Users/pmeir/Desktop/hamburgeria/index.html)
- [style.css](/c:/Users/pmeir/Desktop/hamburgeria/style.css)
- [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js)

## Ajustes rapidos

- WhatsApp da loja: `STORE_WHATSAPP` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:4)
- Chave Pix: `PIX_KEY` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:3)

## Configuracao obrigatoria

- Na Vercel, configure a env var `DELIVERY_QUOTE_SECRET` com uma chave forte e privada.
- Na Vercel, configure a env var `GOOGLE_MAPS_API_KEY` com uma chave de servidor do Google Maps com acesso a `Geocoding API` e `Routes API`.
- Sem essas env vars em qualquer deploy publicado da Vercel, a validacao automatica da entrega nao libera pedidos.
- Depois de subir alteracoes em `api/delivery-quote.js`, faca um novo deploy da Vercel. Sem esse deploy, `/api/delivery-quote` continua respondendo `404`.
- Se abrir o `index.html` direto no navegador ou por um servidor estatico simples, a validacao so funciona se o checkout apontar para um deploy publicado com a API ativa.

## Publicacao

Pode ser publicado como site estatico, sem backend.
