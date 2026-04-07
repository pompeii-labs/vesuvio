FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY tsconfig.json bunfig.toml ./

EXPOSE 7700

CMD ["bun", "run", "src/daemon/index.ts"]
