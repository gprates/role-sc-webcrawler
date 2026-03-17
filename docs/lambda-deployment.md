# Deploy do Crawler em AWS Lambda

## Contexto

O projeto `role-sc-web-crawler` foi originalmente desenvolvido para execução local com Playwright e Firefox. Este documento descreve as decisões técnicas tomadas para adaptar o crawler ao ambiente AWS Lambda, mantendo compatibilidade com o ambiente de desenvolvimento local.

---

## Problema: Playwright + Firefox não funciona em Lambda

O ambiente AWS Lambda é uma sandbox Linux com restrições severas:

| Restrição | Valor |
|-----------|-------|
| Tamanho máximo do pacote (via S3) | 250 MB descomprimido |
| Memória configurável | 128 MB – 10 GB |
| Timeout máximo | 15 minutos |
| Sistema de arquivos gravável | Apenas `/tmp` (512 MB) |
| Binários de sistema | Apenas os presentes na Amazon Linux 2023 |

O Playwright com Firefox exige a instalação do binário do Firefox via `playwright install`, que baixa ~80 MB para um diretório local (`~/.cache/ms-playwright`). Em Lambda não há acesso a esse diretório nem permissão para executar instaladores — tornando o Firefox inviável.

---

## Solução: `@sparticuz/chromium` + `playwright-core`

O pacote [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) fornece um binário do Chromium compilado especificamente para o ambiente Amazon Linux, comprimido em brotli e incluído diretamente no pacote npm.

Em conjunto com `playwright-core` (a biblioteca do Playwright sem browsers bundlados), é possível executar automação de browser em Lambda sem nenhuma instalação adicional.

### Comparação entre as duas estratégias

| Critério | Local (Firefox) | Lambda (Chromium) |
|----------|----------------|-------------------|
| Pacote | `playwright` | `playwright-core` + `@sparticuz/chromium` |
| Browser | Firefox | Chromium (Amazon Linux build) |
| Instalação do binário | `playwright install firefox` | Incluído no npm package |
| Funciona em Lambda | Não | Sim |
| Funciona localmente (Windows/Mac/Linux) | Sim | Não recomendado |

---

## Implementação: Dual Strategy no BrowserFactory

A solução adotada foi o padrão **Strategy** dentro do `BrowserFactory`, com detecção automática de ambiente via variável de ambiente `AWS_LAMBDA_FUNCTION_NAME` — definida automaticamente pela AWS em toda execução Lambda.

```typescript
// src/browser/browser.factory.ts

const isLambda = (): boolean => !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export const BrowserFactory = {
  create: async (): Promise<BrowserContext> => {
    return isLambda() ? createLambdaBrowser() : createLocalBrowser();
  },
  // ...
};
```

### Estratégia local — Firefox

```typescript
const createLocalBrowser = async (): Promise<BrowserContext> => {
  const { firefox } = await import('playwright');
  const browser = await firefox.launch(getFirefoxLaunchOptions());
  // ...
};
```

### Estratégia Lambda — Chromium

```typescript
const createLambdaBrowser = async (): Promise<BrowserContext> => {
  const chromium = await import('@sparticuz/chromium');
  const { chromium: playwrightChromium } = await import('playwright-core');

  const executablePath = await chromium.default.executablePath();
  const browser = await playwrightChromium.launch({
    args: chromium.default.args,
    executablePath,
    headless: true,
  });
  // ...
};
```

### Por que imports dinâmicos (`await import()`)?

Ambas as estratégias usam `import()` dinâmico em vez de `import` estático no topo do arquivo. O motivo é crítico:

- Com `import` estático, o Node.js tenta carregar **todos** os módulos importados na inicialização do processo, independentemente do caminho de execução.
- Em Lambda, o módulo `playwright` não está presente (é `devDependency`). Um import estático causaria `Cannot find module 'playwright'` antes mesmo da função executar.
- Com `import()` dinâmico, cada módulo só é carregado quando o caminho de código correspondente é efetivamente executado, eliminando o erro.

---

## Separação de dependências

Para reduzir o tamanho do pacote de deploy, os pacotes exclusivos do ambiente local foram movidos para `devDependencies`:

```json
// package.json
{
  "dependencies": {
    "@sparticuz/chromium": "^143.0.4",
    "dotenv": "^16.4.5",
    "mongodb": "^7.1.0",
    "playwright-core": "^1.58.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.42.0",
    "playwright": "^1.42.0",
    "pnpm": "^10.32.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.2"
  }
}
```

O script `build:lambda` instala apenas `dependencies` (`--omit=dev`) ao montar o pacote, resultando em um ZIP de ~70 MB.

---

## Arquitetura do pacote de deploy

O script `scripts/package-lambda.js` automatiza a montagem do ZIP:

```
lambda.zip
├── handler.js          ← entry point da Lambda
├── runner.js
├── crawlers/
│   ├── crawler.registry.js
│   ├── base/base.crawler.js
│   └── services/
│       ├── camboriu.crawler.js
│       └── itajai-cultural.crawler.js
├── database/
├── browser/
├── utils/
├── types/
└── node_modules/       ← apenas dependências de produção
```

O handler configurado na Lambda é `handler.handler` — arquivo `handler.js`, export nomeado `handler`.

---

## Entry point da Lambda: handler.ts

```typescript
// src/handler.ts
export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const { municipality, maxPages = 5 } = event;
  // valida o município, chama runCrawler(), retorna statusCode + body
};
```

A Lambda recebe um evento JSON com os parâmetros:

```json
{ "municipality": "camboriu", "maxPages": 1 }
```

---

## Configuração na AWS

| Parâmetro | Valor |
|-----------|-------|
| Runtime | Node.js 22.x |
| Handler | `handler.handler` |
| Memória | 1024 MB |
| Timeout | 5 minutos |
| Variáveis de ambiente | `MONGODB_URI`, `MONGODB_DB_NAME` |

### Por que 1024 MB de memória?

O Chromium é um processo pesado em termos de memória. Testes mostraram que 1024 MB é suficiente para execuções estáveis. Além disso, no Lambda, **memória e CPU são proporcionais** — mais memória significa mais vCPU alocado, o que reduz o tempo de execução.

### Tempo de execução observado

| Crawler | Páginas | Tempo (Lambda 1024 MB) |
|---------|---------|------------------------|
| Camboriú | 1 | ~79 segundos |
| Itajaí Cultural | 1 | ~24 segundos |

---

## Fluxo de atualização do código

```bash
# 1. Compilar e empacotar
pnpm build:lambda

# 2. Subir o lambda.zip para o S3
# (via Console ou AWS CLI)

# 3. Atualizar o código da Lambda
# Lambda Console → Code → Upload from S3
```

---

## Teste local do fluxo completo

Para validar o handler sem fazer deploy, existe o comando:

```bash
pnpm invoke camboriu 1
```

Este comando executa `src/invoke-local.ts`, que chama o `handler` diretamente simulando um evento Lambda. Como `AWS_LAMBDA_FUNCTION_NAME` não está definida localmente, o `BrowserFactory` usa Firefox — validando todo o fluxo (handler → MongoDB → crawler → persistência) sem depender do Chromium.
