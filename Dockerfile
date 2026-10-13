# Imagem para executar o crawler uma vez (job), fora da Lambda.
# Usa o mesmo caminho local do projeto: Firefox do Playwright + `invoke-local`.
# Node 22 é o mesmo runtime configurado na Lambda.
FROM node:22-bookworm-slim

# Navegadores do Playwright num caminho fixo, legível pelo usuário sem privilégios.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Mesma versão do pnpm declarada no package.json/lockfile.
RUN npm install -g pnpm@10.32.1

# Dependências (inclui as de desenvolvimento: `playwright` e `typescript` são
# necessários para o caminho local com Firefox e para compilar).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Firefox na versão exigida pelo `playwright` do lockfile, com as libs do sistema.
RUN pnpm exec playwright install --with-deps firefox \
    && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

USER node

# Configuração em tempo de execução (MONGODB_URI é obrigatória e não tem padrão).
ENV MONGODB_DB_NAME=role_sc \
    HEADLESS=true \
    SLOW_MO=0 \
    CRAWLER="" \
    MAX_PAGES=1

# Equivale a `pnpm invoke <crawler> [maxPages]`: simula uma invocação da Lambda,
# grava em raw_crawls e termina. Argumentos do `docker run` têm prioridade
# sobre as variáveis CRAWLER e MAX_PAGES.
ENTRYPOINT ["/bin/sh", "-c", "exec node dist/invoke-local.js \"${1:-$CRAWLER}\" \"${2:-$MAX_PAGES}\"", "invoke-local"]
CMD []
