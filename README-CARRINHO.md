# Galaxy Burger

Site estatico com checkout via WhatsApp e taxa de entrega validada por uma funcao serverless da Vercel, sem dependencia de API paga.

## Checkout atual

- `Entrega`: endereco preenchido no checkout e validado automaticamente pela API `/api/delivery-quote`.
- `CEP`: opcional e usado apenas para autocomplete via ViaCEP.
- `Taxa por zona local`:
  - `Regiao proxima cadastrada`: `R$ 5,00`
  - `Regiao intermediaria cadastrada`: `R$ 10,00`
  - `Bairro ou rua fora da cobertura`: entrega indisponivel
- `Retirada`: sem taxa.
- `Seguranca`: a taxa nao e escolhida no navegador; o servidor valida rua, numero, bairro, cidade e estado antes de liberar o pedido.

## Arquivos principais

- [index.html](/c:/Users/pmeir/Desktop/hamburgeria/index.html)
- [style.css](/c:/Users/pmeir/Desktop/hamburgeria/style.css)
- [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js)
- [delivery-config.js](/c:/Users/pmeir/Desktop/hamburgeria/delivery-config.js)
- [api/delivery-quote.js](/c:/Users/pmeir/Desktop/hamburgeria/api/delivery-quote.js)

## Ajustes rapidos

- WhatsApp da loja: `STORE_WHATSAPP` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:4)
- Chave Pix: `PIX_KEY` em [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js:3)

## Configuracao obrigatoria

- Na Vercel, configure a env var `DELIVERY_QUOTE_SECRET` com uma chave forte e privada.
- Edite `delivery-config.js` para manter a lista de bairros e ruas atendidas sempre atualizada.
- Sem `DELIVERY_QUOTE_SECRET` em qualquer deploy publicado da Vercel, a validacao automatica da entrega nao libera pedidos.
- Depois de subir alteracoes em `api/delivery-quote.js`, faca um novo deploy da Vercel. Sem esse deploy, `/api/delivery-quote` continua respondendo `404`.
- Se abrir o `index.html` direto no navegador ou por um servidor estatico simples, a validacao so funciona se o checkout apontar para um deploy publicado com a API ativa.

## Publicacao

Pode ser publicado como frontend estatico com a funcao serverless `api/delivery-quote.js` ativa na Vercel.
