FROM node:22-bookworm-slim

WORKDIR /app

ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
