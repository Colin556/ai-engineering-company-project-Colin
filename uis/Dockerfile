FROM node:22-alpine AS dependencies

WORKDIR /app
COPY uis/website/package*.json ./website/
COPY uis/backoffice/package*.json ./backoffice/
RUN cd website && npm ci \
    && cd ../backoffice && npm ci

FROM dependencies AS builder
COPY uis .
COPY docs/event-schemas.json /docs/event-schemas.json
ARG NEXT_PUBLIC_TELEMETRY_ENDPOINT=/backend/telemetry/events
ARG NEXT_PUBLIC_RELEASE_ID=development
RUN cd website && npm run build \
    && cd ../backoffice && NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_TELEMETRY_ENDPOINT=$NEXT_PUBLIC_TELEMETRY_ENDPOINT NEXT_PUBLIC_RELEASE_ID=$NEXT_PUBLIC_RELEASE_ID npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache caddy
WORKDIR /app
COPY --from=builder /app /app
COPY --from=builder /docs /docs
EXPOSE 3000 3001
CMD ["sh", "/app/start.sh"]

FROM dependencies AS development
COPY uis .
COPY docs/event-schemas.json /docs/event-schemas.json
EXPOSE 3000 3001
CMD ["sh", "/app/start.sh"]