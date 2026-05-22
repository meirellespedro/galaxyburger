# Galaxy Burger

Site estatico com checkout via WhatsApp, taxa de entrega validada por uma funcao serverless da Vercel e comanda segura do pedido, sem dependencia de API paga.

## Checkout atual

- `Entrega`: endereco preenchido no checkout e validado automaticamente pela API `/api/delivery-quote`.
- `CEP`: opcional e usado apenas para autocomplete via ViaCEP.
- `Telefone do cliente`: obrigatorio para liberar o envio do pedido.
- `Catalogo central`: precos, disponibilidade e bebidas dos combos saem de `catalog-config.js`.
- `Comanda segura`: o pedido passa pela API `/api/order-ticket` antes de abrir o WhatsApp.
- `Taxa por zona local`:
  - `Regiao proxima`: `R$ 5,00`
  - `Regiao intermediaria`: `R$ 10,00`
  - `Bairro ou rua fora da cobertura`: entrega indisponivel
- `Retirada`: sem taxa.
- `Seguranca`: a taxa nao e escolhida no navegador; o servidor valida rua, numero, bairro, cidade e estado antes de liberar o pedido.
- `Fluxo do WhatsApp`: o pedido fica salvo como pendente ate o cliente confirmar o envio no site, evitando apagar o carrinho cedo demais.

## Arquivos principais

- [index.html](/c:/Users/pmeir/Desktop/hamburgeria/index.html)
- [style.css](/c:/Users/pmeir/Desktop/hamburgeria/style.css)
- [carrinho.js](/c:/Users/pmeir/Desktop/hamburgeria/carrinho.js)
- [store-config.js](/c:/Users/pmeir/Desktop/hamburgeria/store-config.js)
- [catalog-config.js](/c:/Users/pmeir/Desktop/hamburgeria/catalog-config.js)
- [delivery-config.js](/c:/Users/pmeir/Desktop/hamburgeria/delivery-config.js)
- [api/delivery-quote.js](/c:/Users/pmeir/Desktop/hamburgeria/api/delivery-quote.js)
- [api/order-ticket.js](/c:/Users/pmeir/Desktop/hamburgeria/api/order-ticket.js)
- [admin.html](/c:/Users/pmeir/Desktop/hamburgeria/admin.html)
- [admin.js](/c:/Users/pmeir/Desktop/hamburgeria/admin.js)
- [api/admin-login.js](/c:/Users/pmeir/Desktop/hamburgeria/api/admin-login.js)
- [api/admin-inventory.js](/c:/Users/pmeir/Desktop/hamburgeria/api/admin-inventory.js)
- [api/inventory-status.js](/c:/Users/pmeir/Desktop/hamburgeria/api/inventory-status.js)

## Ajustes rapidos

- WhatsApp da loja, Pix e horarios: [store-config.js](/c:/Users/pmeir/Desktop/hamburgeria/store-config.js)
- Cardapio, precos, esgotados e combos: [catalog-config.js](/c:/Users/pmeir/Desktop/hamburgeria/catalog-config.js)

## Configuracao obrigatoria

- Na Vercel, configure a env var `DELIVERY_QUOTE_SECRET` com uma chave forte e privada.
- Opcional: configure `ORDER_TICKET_SECRET`. Se nao existir, a comanda segura reutiliza `DELIVERY_QUOTE_SECRET`.
- Configure `ADMIN_PANEL_PASSWORD` para liberar o acesso ao painel.
- Configure `ADMIN_PANEL_SECRET` para assinar a sessao do painel.
- Configure `BLOB_READ_WRITE_TOKEN` se o painel administrativo for usado em producao na Vercel. Sem essa variavel, o painel nao consegue persistir o estoque entre funcoes e deploys.
- Edite `store-config.js` para atualizar telefone, Pix, iFood e horarios.
- Edite `catalog-config.js` para atualizar precos, combos e itens esgotados.
- Edite `delivery-config.js` para manter a lista de bairros e ruas atendidas sempre atualizada.
- Sem `DELIVERY_QUOTE_SECRET` em qualquer deploy publicado da Vercel, a validacao automatica da entrega nao libera pedidos.
- Depois de subir alteracoes em `api/delivery-quote.js`, faca um novo deploy da Vercel. Sem esse deploy, `/api/delivery-quote` continua respondendo `404`.
- Depois de subir alteracoes em `api/order-ticket.js`, faca um novo deploy da Vercel para a comanda segura refletir a nova regra.
- Se abrir o `index.html` direto no navegador ou por um servidor estatico simples, a validacao so funciona se o checkout apontar para um deploy publicado com a API ativa.

## Publicacao

Pode ser publicado como frontend estatico com as funcoes serverless `api/delivery-quote.js` e `api/order-ticket.js` ativas na Vercel.
