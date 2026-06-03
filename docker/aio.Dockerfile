# Stage 1: Build Go API
FROM golang:1.23-alpine AS api-builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /build
COPY api/ ./
RUN go mod tidy && \
    CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o ps-vault-api ./cmd/server

# Stage 2: Build Next.js web
FROM node:22-alpine AS web-builder

WORKDIR /app
COPY web/package.json ./
RUN npm install
COPY web/ .

ENV NEXT_TELEMETRY_DISABLED=1
# In the all-in-one container the API runs on localhost:8080
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:8080

RUN npm run build

# Stage 3: All-in-one runtime
FROM alpine:3.20

# Runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    postgresql16 \
    postgresql16-contrib \
    nodejs \
    wget \
    su-exec \
    xz

# Install s6-overlay (multi-arch)
ARG S6_OVERLAY_VERSION=3.1.6.2
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
        amd64)  S6_ARCH="x86_64"  ;; \
        arm64)  S6_ARCH="aarch64" ;; \
        *)      echo "Unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -q "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" -O /tmp/s6n.tar.xz && \
    wget -q "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" -O /tmp/s6a.tar.xz && \
    tar -C / -Jxpf /tmp/s6n.tar.xz && \
    tar -C / -Jxpf /tmp/s6a.tar.xz && \
    rm /tmp/s6n.tar.xz /tmp/s6a.tar.xz

# Create app user (postgres system user already exists from postgresql16 package)
RUN addgroup -g 1000 psvault && \
    adduser -D -u 1000 -G psvault psvault && \
    mkdir -p /data/db /data/files /config /run/postgresql && \
    chown postgres:postgres /data/db /run/postgresql && \
    chown psvault:psvault /data/files /config

# Copy API binary
COPY --from=api-builder --chown=psvault:psvault /build/ps-vault-api /app/

# Copy Next.js standalone output
COPY --from=web-builder --chown=psvault:psvault /app/.next/standalone /app/web/
COPY --from=web-builder --chown=psvault:psvault /app/.next/static     /app/web/.next/static
COPY --from=web-builder --chown=psvault:psvault /app/public            /app/web/public

# Copy s6 service definitions and init scripts
COPY docker/s6-services  /etc/s6-overlay/s6-rc.d/
COPY docker/aio-scripts  /app/scripts/
RUN chmod +x /app/scripts/*.sh

EXPOSE 3000

VOLUME ["/data", "/config"]

ENV PSVAULT_ENV=production \
    PSVAULT_DB_URL=postgres://psvault:psvault_db_internal@localhost:5432/psvault?sslmode=disable \
    PSVAULT_DB_TYPE=postgres \
    PSVAULT_STORAGE_BACKEND=local \
    PSVAULT_STORAGE_LOCAL_PATH=/data/files \
    PSVAULT_MAX_FILE_SIZE_MB=100 \
    PSVAULT_REGISTRATION_MODE=invite \
    PSVAULT_APP_NAME="P.S. Vault" \
    PORT=3000 \
    HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/init"]
