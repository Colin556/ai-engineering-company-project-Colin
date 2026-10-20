FROM node:22-alpine AS dependencies

WORKDIR /app
COPY website/package*.json ./website/
COPY backoffice/package*.json ./backoffice/
RUN cd website && npm ci \
    && cd ../backoffice && npm ci

FROM dependencies AS builder
COPY . .
RUN cd website && npm run build \
    && cd ../backoffice && NEXT_TELEMETRY_DISABLED=1 npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache caddy
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3000 3001
CMD ["sh", "/app/start.sh"]

FROM dependencies AS development
COPY . .
EXPOSE 3000 3001
CMD ["sh", "/app/start.sh"]