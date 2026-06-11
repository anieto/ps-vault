# Build stage
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /build

COPY api/go.mod ./
COPY api/ ./
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-w -s" -o ps-vault-api ./cmd/server

# Final stage
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
ARG PUID=1000
ARG PGID=1000
RUN addgroup -g ${PGID} psvault && adduser -D -u ${PUID} -G psvault psvault

WORKDIR /app

COPY --from=builder /build/ps-vault-api .

RUN mkdir -p /data/files && chown -R psvault:psvault /data /app

USER psvault

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["./ps-vault-api"]
