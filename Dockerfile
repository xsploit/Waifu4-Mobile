FROM node:22-bookworm-slim

WORKDIR /app

ENV PORT=3000
ENV HOST=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
