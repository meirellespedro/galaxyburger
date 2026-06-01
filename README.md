# Galaxy Burger

Site em HTML, CSS e JavaScript para a Galaxy Burger, com checkout via WhatsApp, validacao serverless da taxa de entrega por zonas locais e comanda segura de pedido, sem API paga.

## Stack

- HTML
- CSS
- JavaScript vanilla
- Deploy: Vercel
- APIs serverless: `api/delivery-quote.js`, `api/order-ticket.js`, `api/admin-login.js`, `api/admin-inventory.js`, `api/admin-store-status.js`, `api/inventory-status.js` e `api/store-status.js`

## Estrutura

- `index.html`: pagina principal
- `style.css`: estilos globais e responsivos
- `carrinho.js`: logica de checkout, horario, WhatsApp e carrinho
- `store-config.js`: dados centrais da loja, Pix, WhatsApp, horarios e links operacionais
- `catalog-config.js`: catalogo central com produtos, precos, combos e disponibilidade
- `delivery-config.js`: cadastro manual das zonas, bairros e ruas atendidas
- `api/delivery-quote.js`: validacao serverless da taxa por zona
- `api/order-ticket.js`: validacao serverless do pedido, estoque, totais e comanda segura
- `admin.html`: painel simples para login e troca de status de estoque
- `admin.js`: interface do painel administrativo
- `api/_store-status-store.js`: persistencia compartilhada do status operacional da loja
- `api/_inventory-store.js`: persistencia compartilhada do estoque
- `img/`: assets visuais do projeto
- `vercel.json`: configuracao de deploy e headers

## Publicacao na Vercel

Este projeto nao precisa de build step.

- Framework preset: `Other`
- Root directory: `.`
- Build command: vazio
- Output directory: `.`

## Variaveis de ambiente

- `DELIVERY_QUOTE_SECRET`: obrigatoria em qualquer deploy publicado da Vercel para assinar e verificar as cotacoes de entrega.
- `ORDER_TICKET_SECRET`: opcional. Se nao for definida, a API de comanda segura reutiliza `DELIVERY_QUOTE_SECRET`.
- `ADMIN_PANEL_PASSWORD`: obrigatoria para liberar o login do painel administrativo.
- `ADMIN_PANEL_SECRET`: recomendada para assinar a sessao do painel administrativo.
- `BLOB_READ_WRITE_TOKEN`: obrigatoria na Vercel se voce quiser persistir o estoque do painel em producao sem depender do filesystem local.

## Taxa de entrega

- `Regiao proxima`: `R$ 5,00`
- `Regiao intermediaria`: `R$ 10,00`
- `Fora da cobertura`: apenas retirada no local

As regras ficam centralizadas em `delivery-config.js`, com bairros e ruas cadastrados manualmente. O checkout nao depende de Google Maps nem de qualquer outra API paga.

## Catalogo e pedido seguro

- O cardapio agora usa `catalog-config.js` como fonte unica de preco e disponibilidade.
- A comanda do pedido e preparada por `api/order-ticket.js`, que recalcula subtotal, taxa e total antes de abrir o WhatsApp.
- O link compartilhado da comanda nao expoe dados sensiveis em JSON aberto na URL.

## Painel administrativo

- O acesso administrativo fica em `/admin.html`.
- O painel permite abrir ou fechar os pedidos manualmente sem editar codigo.
- O painel atualiza o status do produto e o cardapio principal reage automaticamente.
- O site principal passa a obedecer esse status operacional em poucos segundos e tambem durante o preparo do pedido.
- Em desenvolvimento local, o estoque fica salvo em `data/inventory-status.json`.
- Em desenvolvimento local, o status operacional fica salvo em `data/store-status.json`.
- Em producao na Vercel, use `BLOB_READ_WRITE_TOKEN` para salvar o estoque de forma persistente entre funcoes, reinicios e novos deploys.

## Fluxo profissional recomendado

1. Publicar o projeto em um repositorio GitHub.
2. Importar esse repositorio na Vercel.
3. Conectar a branch `main`.
4. A cada novo push na `main`, a Vercel fara deploy automatico.

## Observacoes

- O arquivo `.gitignore` ja esta preparado para desenvolvimento e deploy.
- O arquivo `vercel.json` aplica headers basicos de seguranca.
- O frontend continua estatico, mas a validacao da entrega depende da funcao serverless `api/delivery-quote.js`.
