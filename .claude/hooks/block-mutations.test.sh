#!/bin/bash
# Pipe-test for block-mutations.sh. DENY = prints JSON, ALLOW = prints nothing.
# Run after editing the hook: bash .claude/hooks/block-mutations.test.sh
HOOK="$(cd "$(dirname "$0")" && pwd)/block-mutations.sh"
fail=0

check() { # check <expect: DENY|ALLOW> <tool> <command>
  expect=$1; tool=$2; cmd=$3
  out=$(jq -nc --arg t "$tool" --arg c "$cmd" '{tool_name:$t,tool_input:{command:$c}}' | bash "$HOOK")
  if [ -n "$out" ]; then got=DENY; else got=ALLOW; fi
  if [ "$got" = "$expect" ]; then
    printf '  ok   %-5s %s\n' "$got" "${cmd:-$tool}"
  else
    printf '  FAIL want %s got %s: %s\n' "$expect" "$got" "${cmd:-$tool}"
    fail=1
  fi
}

echo "wrangler:"
check DENY  Bash 'npx wrangler deploy'
check DENY  Bash 'cd worker && npx wrangler deploy'
check DENY  Bash 'npx wrangler secret put GOOGLE_API_KEY'
check DENY  Bash 'npx wrangler kv key put --binding=BOX_PRICES a b'
check DENY  Bash 'npx wrangler delete'
check DENY  Bash 'npx wrangler pages deploy dist'
check DENY  Bash 'npx wrangler rollback'
check ALLOW Bash 'npx wrangler deploy --dry-run'
check ALLOW Bash 'npx wrangler whoami'
check ALLOW Bash 'npx wrangler secret list'
check ALLOW Bash 'npx wrangler kv key list --binding=BOX_PRICES'
check ALLOW Bash 'npx wrangler deployments list'
check ALLOW Bash 'npx wrangler versions list'
check ALLOW Bash 'npx wrangler tail'

echo "cloudflare api:"
check DENY  Bash 'curl -X DELETE https://api.cloudflare.com/client/v4/zones/x'
check DENY  Bash 'curl --request POST https://api.cloudflare.com/client/v4/accounts/x/workers'
check ALLOW Bash 'curl https://api.cloudflare.com/client/v4/zones'
check ALLOW Bash 'curl -s https://mtga.fyi/api/box-prices'

echo "release:"
check DENY  Bash 'npm publish'
check DENY  Bash 'gh pr merge 100'
check DENY  Bash 'gh workflow run deploy.yml'
check DENY  Bash 'gh release create v1'

echo "ordinary work stays allowed:"
check ALLOW Bash 'git push -u origin my-branch'
check ALLOW Bash 'gh pr create --title x --body y'
check ALLOW Bash 'npm test'
check ALLOW Bash 'npm run build'
check ALLOW Bash 'npm run box:prices -- --write'
check ALLOW Bash 'git commit -m "create the thing"'
check ALLOW Bash 'rm -rf node_modules'
check ALLOW Bash 'mkdir -p src/lib && touch src/lib/x.ts'

echo "mcp tools:"
check DENY  mcp__plugin_cloudflare_cloudflare-bindings__kv_namespace_delete ''
check DENY  mcp__plugin_cloudflare_cloudflare-bindings__r2_bucket_create ''
check DENY  mcp__plugin_cloudflare_cloudflare-bindings__d1_database_query ''
check ALLOW mcp__plugin_cloudflare_cloudflare-observability__workers_list ''
check ALLOW mcp__plugin_cloudflare_cloudflare-bindings__kv_namespaces_list ''
check ALLOW mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation ''

echo
[ $fail -eq 0 ] && echo "ALL PASS" || echo "FAILURES"
exit $fail
