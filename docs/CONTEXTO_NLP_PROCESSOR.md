# Contexto Completo — Projeto nlp-processor

Documento para transferência de contexto entre chats. Leia tudo antes de começar a implementar.

---

## 1. VISÃO GERAL DO ECOSSISTEMA

Este projeto faz parte de um TCC cujo objetivo é um **aplicativo mobile em React Native** que exibe automaticamente **eventos culturais e municipais** dos municípios: **Itajaí, Camboriú, Porto Belo, Itapema e Bombinhas** (SC).

O ecossistema é dividido em 4 projetos com responsabilidades isoladas:

| Projeto | Responsabilidade | Status |
|---------|-----------------|--------|
| **role-sc-web-crawler** | Crawling com Playwright → salva texto bruto no MongoDB Atlas | ✅ Implementado e rodando em AWS Lambda |
| **nlp-processor** (este) | Lê `raw_crawls`, processa com IA, gera eventos estruturados | 🔨 A implementar |
| **api** | Expõe a coleção `eventos` via REST/GraphQL para o app | Futuro |
| **app** | React Native — exibe eventos com filtros por região | Futuro |

**Fluxo completo:**
```
Sites municipais → Lambda Crawler → MongoDB (raw_crawls)
                                           ↓
                              Lambda NLP (Groq/Llama)
                                           ↓
                              MongoDB (eventos processados)
                                           ↓
                                    API → App Mobile
```

---

## 2. O QUE O nlp-processor FAZ

É uma **AWS Lambda** que:

1. Conecta no MongoDB Atlas
2. Busca documentos na coleção `raw_crawls` onde `processed: false`
3. Para cada documento, envia o `rawText` para a API do **Groq** com um prompt que extrai informações de evento
4. Parseia a resposta JSON da IA
5. Salva o evento estruturado na coleção `eventos`
6. Marca o documento original como `processed: true`

### Trigger
EventBridge (cron) — rodando após o crawler terminar. Ex: se o crawler roda às 6h, o NLP roda às 6h30.

---

## 3. DADOS DE ENTRADA — coleção `raw_crawls`

Interface exata usada pelo crawler (MongoDB Atlas, banco `raw_crawls`, coleção `raw_crawls`):

```typescript
interface RawCrawl {
  _id?: ObjectId;
  site: string;           // ex: "Camboriú", "Fundação Cultural de Itajaí"
  municipality: string;   // ex: "Camboriú", "Itajaí"
  url: string;            // URL original do artigo
  title: string;          // título do artigo
  rawText: string;        // texto completo do artigo (título + data + corpo)
  publishedAt: string;    // data de publicação como string do site
  crawledAt: Date;        // quando foi coletado
  processed: boolean;     // false = ainda não passou pela IA
}
```

**Exemplos reais de `rawText`:**

```
Camboriú recebe 3ª edição do festival Sabores do Mar

14 de março de 2026

A Secretaria de Turismo e Cultura de Camboriú confirma a realização da 3ª edição
do festival Sabores do Mar, que acontecerá no dia 22 de março, das 10h às 22h,
na Praça Central. O evento reunirá mais de 30 expositores...
```

```
[Cultura]

Exposição Fotográfica "Litoral Vivo" em Itajaí

10 de março de 2026

A Fundação Cultural de Itajaí apresenta a exposição fotográfica "Litoral Vivo",
com abertura no dia 15 de março às 19h, no Centro Cultural Itajaí...
```

---

## 4. DADOS DE SAÍDA — coleção `eventos`

A estrutura da coleção `eventos` ainda **não está definida** — o usuário quer combinar essa estrutura no início do chat. Sugestão base para discutir:

```typescript
interface Evento {
  _id?: ObjectId;
  titulo: string;
  descricao?: string;
  data?: string;           // data do evento (não da publicação)
  horario?: string;        // ex: "19h", "10h às 22h"
  local?: string;          // nome do local, praça, endereço
  municipio: string;       // herdado do raw_crawl
  site: string;            // herdado do raw_crawl
  url: string;             // URL da notícia original
  publishedAt: string;     // data de publicação (herdada do raw_crawl)
  processedAt: Date;       // quando o NLP processou
  rawCrawlId: ObjectId;    // referência ao documento original
}
```

**Campos opcionais (`?`) recebem `null` quando a IA não encontrar a informação.**

**Deduplicação sugerida:** por `url` (um evento por artigo) ou por `titulo + data + municipio`.

---

## 5. GROQ — A ESCOLHA DE IA

### Por que Groq
- **Custo**: tier gratuito generoso (suficiente para o TCC)
- **Velocidade**: inferência muito rápida (ideal para Lambda)
- **JSON mode**: retorna JSON estruturado nativamente, sem necessidade de parsing frágil
- **Modelos**: Llama 3.1 8B (mais rápido/barato) ou Llama 3.3 70B (mais preciso)

### Configuração
```
GROQ_API_KEY=...   (obtida em console.groq.com → API Keys)
```

### Rate limits (tier gratuito)
- ~30 requests/minuto
- ~14.400 tokens/minuto
- O processor deve respeitar esses limites com um delay entre chamadas ou processamento em lotes

### Exemplo de chamada
```typescript
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const response = await groq.chat.completions.create({
  model: 'llama-3.1-8b-instant',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: `Você é um extrator de informações de eventos culturais.
Analise o texto e retorne um JSON com as chaves:
titulo, descricao, data, horario, local.
Use null para campos sem informação.
Responda APENAS com o JSON, sem explicações.`,
    },
    {
      role: 'user',
      content: rawText,
    },
  ],
});

const evento = JSON.parse(response.choices[0].message.content);
```

### Modelo recomendado para começar
`llama-3.1-8b-instant` — rápido e barato. Se a qualidade da extração não for satisfatória, migra para `llama-3.3-70b-versatile`.

---

## 6. STACK DO PROJETO

Seguir o mesmo padrão do `role-sc-web-crawler`:

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| TypeScript | ^5.4 | Linguagem principal |
| Node.js | 22.x | Runtime |
| pnpm | latest | Package manager |
| groq-sdk | latest | Cliente oficial da API Groq |
| mongodb | ^7 | Cliente MongoDB |
| dotenv | ^16 | Variáveis de ambiente |
| ts-node | ^10 | Execução local |

---

## 7. ARQUITETURA SUGERIDA

```
src/
├── handler.ts              ← entry point da Lambda
├── runner.ts               ← lógica principal (busca, processa, salva)
├── invoke-local.ts         ← teste local simulando evento Lambda
├── groq/
│   └── groq.client.ts      ← instância e chamada à API Groq
├── processors/
│   └── event.processor.ts  ← prompt, chamada Groq, parse da resposta
├── database/
│   ├── mongodb.connection.ts
│   └── repositories/
│       ├── raw-crawl.repository.ts   ← busca processed:false, marca processed:true
│       └── evento.repository.ts      ← salva na coleção eventos
├── types/
│   ├── raw-crawl.types.ts
│   └── evento.types.ts
└── utils/
    └── logger.utils.ts
```

### Design Patterns a considerar
- **Repository Pattern** — já usado no crawler, manter consistência
- **Facade** — `event.processor.ts` esconde complexidade do Groq
- **Singleton** — conexão MongoDB (igual ao crawler)
- Analisar outros patterns em refactoring.guru conforme necessidade

---

## 8. HANDLER DA LAMBDA

O evento recebido deve suportar processamento por município (opcional) ou todos de uma vez:

```typescript
interface LambdaEvent {
  municipality?: string;  // se informado, processa só esse município
  batchSize?: number;     // quantos raw_crawls processar por execução (default: 50)
}
```

Resposta:
```typescript
interface LambdaResponse {
  statusCode: number;
  body: string; // JSON com { success, processed, saved, skipped, elapsedSeconds }
}
```

---

## 9. CONFIGURAÇÃO AWS

| Parâmetro | Valor sugerido |
|-----------|---------------|
| Runtime | Node.js 22.x |
| Handler | `handler.handler` |
| Memória | 256 MB (sem browser, só chamadas de API) |
| Timeout | 5 minutos |
| Trigger | EventBridge (cron, após o crawler) |

**Variáveis de ambiente:**
- `MONGODB_URI` — connection string do Atlas
- `MONGODB_DB_NAME` — nome do banco
- `GROQ_API_KEY` — chave da API Groq

---

## 10. CONSIDERAÇÕES IMPORTANTES

### Economia
- O tier gratuito do Groq é mais que suficiente para o TCC
- O Lambda com 256 MB para chamadas de API é muito mais barato que o crawler (sem browser)
- Processar em lotes pequenos (`batchSize`) evita timeout e respeita rate limit do Groq

### Qualidade da extração
- Nem todo artigo é um evento — alguns são notícias genéricas da prefeitura
- A IA pode retornar todos os campos como `null` para artigos sem evento
- Sugestão: salvar mesmo assim na coleção `eventos` com flag `isEvent: boolean` para o app filtrar depois — **ou** simplesmente não salvar se todos os campos forem null. Decidir no início do chat.

### Retry e resiliência
- Se o Groq falhar (rate limit, timeout), manter `processed: false` para retry na próxima execução
- Usar try/catch por documento — um erro não deve parar o processamento dos demais

### Deduplicação
- Index único por `url` na coleção `eventos` é a forma mais simples
- Evita duplicatas mesmo se o NLP rodar mais de uma vez no mesmo raw_crawl

---

## 11. PRINCÍPIOS DO USUÁRIO

- **Pragmatismo sobre perfeccionismo**
- **Boas práticas e SOLID**
- **Analisar design patterns** (refactoring.guru) antes de implementar
- **Baixa complexidade** — evitar over-engineering
- **Stack AWS preferred**
- Sempre justificar as decisões técnicas

---

## 12. PRÓXIMOS PASSOS APÓS O nlp-processor

1. **API** — expor coleção `eventos` via REST (Lambda + API Gateway ou Express/Fastify)
2. **App Mobile** — React Native consumindo a API, filtros por município

---

*Documento gerado em março de 2026 para transferência de contexto entre chats.*
