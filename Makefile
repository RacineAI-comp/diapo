.DEFAULT_GOAL := help
BACKEND  := src/backend
FRONTEND := src/frontend

.PHONY: help dev dev-full dev-down backend-install backend-lint backend-test \
        frontend-install frontend-typecheck frontend-build verify

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Run the development stack (frontend + collab + backend + Postgres + Redis)
	docker compose up

dev-full: ## Run the stack with Keycloak SSO and object storage (needs .env)
	docker compose --profile full --env-file .env up

dev-down: ## Stop the stack and remove volumes
	docker compose --profile full down -v

backend-install: ## Create the backend virtualenv and install dependencies
	cd $(BACKEND) && uv venv && uv pip install -e '.[dev]'

backend-lint: ## Lint the backend with ruff
	cd $(BACKEND) && uv run ruff check .

backend-test: ## Run the backend test suite (SQLite, no external services)
	cd $(BACKEND) && uv run python manage.py test

frontend-install: ## Install frontend dependencies
	cd $(FRONTEND) && npm install

frontend-typecheck: ## Type-check the frontend
	cd $(FRONTEND) && npm run typecheck

frontend-build: ## Production build of the frontend
	cd $(FRONTEND) && npm run build

verify: ## Run the CRDT invariant checks
	cd $(FRONTEND) && npm run verify:crdt && npm run verify:deck && npm run verify:text \
	  && npm run verify:textsync && npm run verify:undo
