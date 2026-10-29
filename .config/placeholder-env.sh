#!/usr/bin/env bash
# The placeholder env Varlock validates when Next loads its config (typegen,
# build). Real values exist only at runtime: these are fixed, obviously fake
# placeholders. Fixed rather than random per run: every one of them is in
# turbo.json's globalEnv, so a random value changed every task's hash and
# Turborepo never had a cache hit. The per-environment settings
# (apps/web/.env.schema) get CI's own values, and the catalog and pricing
# rules the tests' fixtures.
#
# Used by CI (.github/actions/setup) and the pre-push hook
# (.config/lefthook.yml), so a fresh checkout needs no .env file.
#   placeholder-env.sh            print KEY=value lines (CI appends them to $GITHUB_ENV)
#   placeholder-env.sh CMD...     run CMD with them exported
set -euo pipefail

fixture() {
  node --input-type=module -e "const m = await import('$1'); console.log(JSON.stringify(m['$2']))"
}
# Derived from public strings, so the values are the same on every run
# without a key-shaped literal in the repository. Anyone can recompute them:
# they protect nothing and are used only in CI.
placeholder() {
  printf 'wovain-ci-placeholder-%s' "$1" | shasum -a 256 | cut -c1-64
}

emit() {
  echo "BETTER_AUTH_SECRET=$(placeholder better-auth)"
  echo "BETTER_AUTH_URL=http://localhost:3001"
  echo "DATABASE_URL=postgresql://ci:$(placeholder database | cut -c1-32)@localhost:5432/ci"
  echo "TOKEN_ENCRYPTION_KEY=$(placeholder token-encryption | xxd -r -p | base64)"
  echo "BILLING_CATALOG=$(fixture ./packages/billing/src/catalog-fixture.ts TEST_CATALOG)"
  echo "DOCS_URL=http://localhost:4000"
  echo "EMAIL_FROM=wovain <ci@example.com>"
  echo "FAL_ART_MODELS=$(fixture ./packages/core/src/config-fixture.ts TEST_ART_MODELS)"
  echo "FAL_MCP_URL=https://fal.example.com/mcp"
  echo "FOURTHWALL_DEFAULT_PRODUCT_ID=pro_ci"
  echo "FOURTHWALL_MCP_URL=https://fourthwall.example.com/mcp"
  echo "GUARDRAIL_INJECTION_THRESHOLD=0.8"
  echo "GUARDRAIL_MODERATION_THRESHOLD=0.7"
  echo "GUARDRAIL_PII_THRESHOLD=0.7"
  echo "MCP_URL=http://localhost:3001/api/mcp"
  echo "MCP_WIDGET_RESOURCE_DOMAINS=https://media.example.com"
  echo "META_MCP_SCOPE=ads_read"
  echo "META_MCP_URL=https://meta.example.com/mcp"
  echo "PRIVACY_EMAIL=privacy@example.com"
  echo "NEMOTRON_INPUT_PRICE=0.3"
  echo "NEMOTRON_OUTPUT_PRICE=0.9"
  echo "PRICING_RULES=$(fixture ./packages/core/src/config-fixture.ts TEST_PRICING_RULES)"
  echo "SUPPORT_EMAIL=support@example.com"
}

if [ "$#" -eq 0 ]; then
  emit
else
  vars=$(emit)
  while IFS= read -r line; do export "$line"; done <<<"$vars"
  exec "$@"
fi
