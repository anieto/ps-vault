.PHONY: help build up down logs dev-api dev-web migrate lint test backup deploy

# Default target
help:
	@echo "P.S. Vault — available commands:"
	@echo ""
	@echo "  make build      Build all Docker images"
	@echo "  make up         Start all services (production)"
	@echo "  make down       Stop all services"
	@echo "  make logs       Follow service logs"
	@echo "  make dev-api    Run API locally (requires Go)"
	@echo "  make dev-web    Run web app locally (requires Node)"
	@echo "  make migrate    Run database migrations"
	@echo "  make lint       Lint Go code"
	@echo "  make test       Run Go tests"
	@echo "  make backup     Back up database and files"
	@echo "  make deploy     Pull latest code and rebuild all services"

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

dev-api:
	cd api && go run ./cmd/server

dev-web:
	cd web && npm run dev

migrate:
	cd api && go run ./cmd/server migrate

lint:
	cd api && go vet ./...

test:
	cd api && go test ./...

backup:
	@chmod +x docker/backup.sh
	@./docker/backup.sh ./backups

deploy:
	git pull origin main
	docker compose build
	docker compose up -d
