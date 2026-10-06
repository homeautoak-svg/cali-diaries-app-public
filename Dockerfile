# Stufe 1: Frontend-Bundle aus src/ bauen (wird danach verworfen)
FROM node:20-bookworm-slim AS frontend

WORKDIR /build

COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY src ./src
RUN npx --yes esbuild src/main.jsx --bundle --outfile=bundle.js --loader:.jsx=jsx --jsx=automatic --minify

# Stufe 2: eigentlicher Server
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public
COPY --from=frontend /build/bundle.js ./public/bundle.js

ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/uploads
ENV PORT=4000

EXPOSE 4000

CMD ["node", "server.js"]
