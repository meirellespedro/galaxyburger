# Galaxy Burger

Site em HTML, CSS e JavaScript para a Galaxy Burger, com checkout via WhatsApp e validacao serverless de taxa de entrega na Vercel.

## Stack

- HTML
- CSS
- JavaScript vanilla
- Deploy: Vercel
- API serverless: `api/delivery-quote.js`

## Estrutura

- `index.html`: pagina principal
- `style.css`: estilos globais e responsivos
- `carrinho.js`: logica de checkout, horario, WhatsApp e carrinho
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

## Fluxo profissional recomendado

1. Publicar o projeto em um repositorio GitHub.
2. Importar esse repositorio na Vercel.
3. Conectar a branch `main`.
4. A cada novo push na `main`, a Vercel fara deploy automatico.

## Observacoes

- O arquivo `.gitignore` ja esta preparado para desenvolvimento e deploy.
- O arquivo `vercel.json` aplica headers basicos de seguranca.
- O projeto pode ser servido como site estatico puro.
