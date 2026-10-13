# Rolê SC: web crawler

Crawler modular em TypeScript (Node.js + Playwright) que coleta notícias e agenda cultural de sites públicos de prefeituras e fundações culturais do litoral norte de Santa Catarina. Cada publicação vira um documento na coleção `raw_crawls` do MongoDB, que depois é lida pelo processador NLP do Rolê SC (repositório `role-sc-processador-nlp-webcrawls`).

O crawler não classifica nem interpreta o conteúdo: abre a listagem da fonte, entra em cada publicação, extrai título, data, texto e imagem de capa e grava o texto bruto. Em produção roda como uma função AWS Lambda, uma invocação por fonte.

## Fontes

| Chave do crawler | Município gravado | Fonte |
|---|---|---|
| `camboriu` | Camboriú | `https://camboriu.sc.gov.br/category/noticias/` |
| `itajai-cultural` | Itajaí | `https://fundacaocultural.itajai.sc.gov.br/noticias/` |
| `bombinhas` | Bombinhas | `https://www.culturabombinhas.com.br/noticias` |
| `balneario-camboriu` | Balneário Camboriú | `https://culturabc.com.br/agenda-cultural/` |
| `porto-belo` | Porto Belo | `https://portobelo.sc.gov.br/noticias/` |
| `itapema` | Itapema | `https://www.itapema.sc.gov.br/noticia/` |

As URLs ficam em `src/config/sites.config.ts` e o registro dos crawlers em `src/crawlers/crawler.registry.ts`.

O argumento `maxPages` limita quantas páginas da listagem são percorridas, com duas exceções: em `balneario-camboriu` ele é o número máximo de eventos, e em `bombinhas` é ignorado (a fonte carrega mais itens por JavaScript, então só a primeira página é lida).

Os seletores dependem do HTML de cada site. Se um crawler terminar com `Encontrados 0 cards`, provavelmente a fonte mudou de layout e os seletores do arquivo `src/crawlers/services/<fonte>.crawler.ts` precisam ser revistos.

## O que é gravado

Coleção `raw_crawls`, no banco indicado por `MONGODB_DB_NAME`:

| Campo | Conteúdo |
|---|---|
| `site` | nome da fonte (ex.: "Fundação Cultural de Itajaí") |
| `municipality` | nome de exibição do município, com acento (ex.: "Itajaí") |
| `url` | URL da publicação; índice único, usado para deduplicar |
| `title` | título |
| `rawText` | título, data e corpo do texto (o layout varia por fonte) |
| `imageUrl` | URL absoluta da imagem de capa ou `null` |
| `publishedAt` | data como texto livre da fonte (em Porto Belo, ISO 8601) |
| `crawledAt` | data da coleta |
| `processed` | sempre `false` na gravação; o processador NLP marca `true` |

Uma URL já gravada não é regravada: na reexecução o documento é ignorado, e só o `imageUrl` é preenchido se estava vazio. Os índices (`url` único, `processed` e `site + crawledAt`) são criados a cada execução.

## Rodar localmente

Pré-requisitos:

- Node.js 22 ou superior (a Lambda usa Node.js 22.x).
- pnpm 10 ou superior.
- Um MongoDB acessível. O jeito mais simples é um container: `docker run -d --name role-sc-mongo -p 27017:27017 mongo:7`.

Passos:

```bash
pnpm install --frozen-lockfile

# Firefox usado pelo Playwright no modo local (necessário uma vez por máquina).
# No Linux, use "pnpm exec playwright install --with-deps firefox" para instalar também as bibliotecas do sistema.
pnpm exec playwright install firefox

cp .env.example .env   # ajuste MONGODB_URI se o Mongo não estiver em localhost:27017

pnpm invoke itajai-cultural 1
```

`pnpm invoke <crawler> [maxPages]` simula uma invocação da Lambda (chama o mesmo `handler`) e imprime o status e o resumo da execução, por exemplo `{"success":true,"crawledPages":1,"saved":3,...}`. Sem `maxPages`, usa 1. Localmente o navegador é o Firefox do Playwright; o Chromium da Lambda só é usado quando a variável `AWS_LAMBDA_FUNCTION_NAME` existe.

Outros comandos:

| Comando | O que faz |
|---|---|
| `pnpm dev <crawler> [maxPages]` | executa o crawler direto, sem passar pelo handler (padrão: 5 páginas) |
| `pnpm build` | compila para `dist/` |
| `pnpm inspect:images [município] [limite]` | lista os últimos documentos de `raw_crawls` e se têm imagem; o município é o nome de exibição (ex.: `"Itajaí"`) |
| `pnpm build:lambda` | gera o pacote de deploy (ver [Deploy](#deploy)) |

O script `pnpm lint` existe no `package.json`, mas não funciona: o eslint não está instalado nem configurado.

Para ver o navegador durante a coleta, use `HEADLESS=false` (e `SLOW_MO=500`, por exemplo) no `.env`.

## Rodar com Docker

A imagem executa o crawler uma vez e termina (é um job, como a Lambda, não um servidor). Ela já traz o Firefox do Playwright e roda o equivalente a `pnpm invoke <crawler> [maxPages]` com o código compilado.

```bash
docker build -t role-sc-webcrawler .

# MongoDB numa rede Docker
docker network create role-sc
docker run -d --name role-sc-mongo --network role-sc mongo:7

# Uma execução: crawler e maxPages como argumentos...
docker run --rm --init --network role-sc \
  -e MONGODB_URI=mongodb://role-sc-mongo:27017 \
  role-sc-webcrawler itajai-cultural 1

# ...ou como variáveis de ambiente
docker run --rm --init --network role-sc \
  -e MONGODB_URI=mongodb://role-sc-mongo:27017 \
  -e CRAWLER=porto-belo -e MAX_PAGES=1 \
  role-sc-webcrawler
```

Os argumentos têm prioridade sobre `CRAWLER` e `MAX_PAGES`. Sem crawler informado, o container imprime o uso e sai com código 1. Se o Mongo estiver rodando fora do Docker, no Docker Desktop use `MONGODB_URI=mongodb://host.docker.internal:27017`.

Para conferir o que foi gravado:

```bash
docker exec role-sc-mongo mongosh role_sc --quiet --eval 'db.raw_crawls.countDocuments()'
```

O código de saída do container é 0 mesmo quando a execução falha (por exemplo, sem conexão com o Mongo): o resultado aparece no log, nas linhas `Status: 200` ou `Status: 500` e `Body: ...`.

## Variáveis de ambiente

O código lê apenas estas variáveis (veja `.env.example`). Localmente elas vêm do `.env` (carregado pelo `dotenv`); no Docker e na Lambda, do ambiente.

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `MONGODB_URI` | sim | (nenhum) | string de conexão do MongoDB |
| `MONGODB_DB_NAME` | sim | `role_sc` na imagem Docker; sem padrão no código | banco onde fica `raw_crawls`; precisa ser o mesmo do processador NLP e da API |
| `HEADLESS` | não | `true` | `false` abre a janela do Firefox; só vale fora da Lambda |
| `SLOW_MO` | não | `0` | atraso em ms entre ações do Firefox; só vale fora da Lambda |
| `AWS_LAMBDA_FUNCTION_NAME` | não definir | (injetada pela AWS) | quando existe, o crawler usa o Chromium da Lambda (`@sparticuz/chromium`) em vez do Firefox |

Só na imagem Docker:

| Variável | Padrão | Uso |
|---|---|---|
| `CRAWLER` | vazio | chave do crawler, usada quando não há argumento |
| `MAX_PAGES` | `1` | `maxPages`, usado quando não há segundo argumento |

## Deploy

O deploy é manual: um `.zip` com o código compilado e as dependências de produção, enviado para o S3 e carregado na função Lambda pelo console. Não há template SAM/CloudFormation nem CI neste repositório. Detalhes técnicos (por que Chromium na Lambda e Firefox local) em `docs/lambda-deployment.md`.

1. Gerar o pacote:

   ```bash
   pnpm build:lambda
   ```

   O comando compila com `tsc`, copia `dist/` para `lambda-build/`, instala só as dependências de produção com `npm install --omit=dev --no-package-lock` (sem usar o lockfile) e gera `lambda.zip` (cerca de 70 MB) com o `Compress-Archive` do PowerShell. Por isso o script de empacotamento **só funciona no Windows**.

2. Enviar o `lambda.zip` para um bucket S3, pelo console ou pela AWS CLI:

   ```bash
   aws s3 cp lambda.zip s3://<bucket-de-deploy>/lambda.zip
   ```

3. No console da Lambda: **Code → Upload from → Amazon S3 location**, informando a URL do objeto enviado.

Configuração da função (feita uma vez, à mão, no console):

| Parâmetro | Valor |
|---|---|
| Runtime | Node.js 22.x |
| Handler | `handler.handler` |
| Memória | 1024 MB |
| Timeout | 5 minutos |
| Variáveis de ambiente | `MONGODB_URI` e `MONGODB_DB_NAME` |

A função recebe um evento com a chave do crawler e o limite de páginas (padrão 5 na Lambda):

```json
{ "municipality": "itajai-cultural", "maxPages": 1 }
```

e responde `{ "statusCode": 200, "body": "{\"success\":true,\"crawledPages\":1,\"saved\":...}" }`, ou `400` para chave inválida e `500` para erro na execução.

**Agendamento:** não está documentado nem versionado neste repositório. Como cada invocação processa uma única fonte, cada crawler precisa de uma invocação própria; como e quando isso é disparado em produção (EventBridge, outro agendador ou manualmente) não está registrado aqui.

## Estrutura

```
src/
  handler.ts            entrada da Lambda (evento { municipality, maxPages })
  invoke-local.ts       simula a Lambda localmente (pnpm invoke)
  index.ts              CLI direta (pnpm dev)
  runner.ts             conecta ao Mongo, roda o crawler e grava raw_crawls
  browser/              Firefox local ou Chromium na Lambda
  crawlers/             registro e um crawler por fonte (services/)
  database/             conexão e repositório de raw_crawls
  config/sites.config.ts  URLs das fontes
scripts/package-lambda.js  empacotamento do lambda.zip
docs/                   notas sobre o deploy na Lambda e o contrato com o NLP
```
