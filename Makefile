HOME := $(shell echo $$HOME)
HERE := $(shell echo $$PWD)

BIOME_SCOPE ?= src/index.ts src/core.ts __tests__ package.json tsconfig.json biome.json knip.json vitest.config.unit.ts vitest.config.integration.ts vitest.config.llm.ts
JSCPD_SCOPE ?= src/index.ts src/core.ts __tests__
TEST_CONFIG_UNIT ?= vitest.config.unit.ts
TEST_CONFIG_INTEGRATION ?= vitest.config.integration.ts
TEST_CONFIG_LLM ?= vitest.config.llm.ts

SHELL = /bin/bash -Eeu -o pipefail

.DEFAULT_GOAL := help

.PHONY: help
help:    ## A brief listing of all available commands
	@awk '/^[a-zA-Z0-9_-]+:.*##/ { \
		printf "%-25s # %s\n", \
		substr($$1, 1, length($$1)-1), \
		substr($$0, index($$0,"##")+3) \
	}' $(MAKEFILE_LIST)

.PHONY: doctor
doctor: ## Verify toolchain prerequisites
	@for cmd in bun node make; do \
		command -v $$cmd >/dev/null 2>&1 || { echo "$$cmd is required"; exit 1; }; \
	done
	@echo "TypeScript/pi-package scaffold ready."

.PHONY: ci
ci:
	bun install --frozen-lockfile

.PHONY: init
init:  ## Bootstrap dependencies and setup
	bun install

.PHONY: upgrade-deps
upgrade-deps:    ## Upgrade all dependencies to their latest versions
	bun update

.PHONY: check-tagref
check-tagref:
	@if command -v tagref >/dev/null 2>&1; then \
		tagref; \
	else \
		echo "tagref not installed; skipping tagref validation"; \
	fi

.PHONY: check-biome
check-biome:
	bunx @biomejs/biome check $(BIOME_SCOPE)

.PHONY: check-typescript
check-typescript:
	bunx tsc --noEmit

.PHONY: check-knip
check-knip:
	bunx knip

.PHONY: check-jscpd
check-jscpd:
	bunx jscpd $(JSCPD_SCOPE)

.PHONY: check
check: check-biome check-typescript check-tagref check-knip check-jscpd    ## Run static analysis and project health checks
	@echo "All checks passed!"

.PHONY: format
format:    ## Format project files with Biome
	bunx @biomejs/biome check --write $(BIOME_SCOPE)

.PHONY: test-unit
test-unit:
	bunx vitest run --config $(TEST_CONFIG_UNIT)

.PHONY: test-llm
test-llm:
	bunx vitest run --config $(TEST_CONFIG_LLM)

.PHONY: test-integration
test-integration:
	bunx vitest run --config $(TEST_CONFIG_INTEGRATION)

.PHONY: test
test: test-unit    ## Run the default test suite

.PHONY: dev
dev:    ## Run the local development watch loop
	bun run dev

.PHONY: build
build: check    ## Build the TypeScript package
	bun run build

.PHONY: clean
clean:     ## Delete generated artifacts
	rm -rf node_modules/
	rm -rf dist/
	rm -rf coverage/
	rm -f *.tsbuildinfo
