#!/bin/bash
#
# PreToolUse guard: an agent may inspect deployed infrastructure but not change
# it. Production ships from .github/workflows/deploy.yml, which tests before it
# uploads; a local `wrangler deploy` bypasses that gate and leaves main behind
# what is live. Read-only stays open — whoami, list, get, tail, --dry-run — and
# local work (git, gh pr, file edits) is untouched.
set -u

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // ""')
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

# Word boundaries that behave the same under BSD and GNU grep.
B_OPEN='(^|[^[:alnum:]_.-])'
B_CLOSE='([^[:alnum:]_.-]|$)'

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}' \
    "$(printf '%s' "$1" | jq -Rs .)"
  exit 0
}

has() { printf '%s' "$cmd" | grep -qE "$1"; }

# Cloudflare MCP tools that write.
case "$tool" in
mcp__plugin_cloudflare_*)
  printf '%s' "$tool" | grep -qE '_(create|delete|update|edit|put|query)$' &&
    deny "Blocked: $tool changes deployed Cloudflare state. Read-only equivalents (list, get, docs, observability) are allowed. Route the change through a PR, or ask the user to run it."
  ;;
esac

[ -n "$cmd" ] || exit 0

# `logout` is deliberately absent: it removes a local credential rather than
# changing anything deployed, and it is the actual fix this guard only
# approximates. Blocking it would block the remedy.
MUTATE="${B_OPEN}(deploy|publish|delete|destroy|rollback|put|create|rename|upload|execute|bulk)${B_CLOSE}"

# wrangler, unless --dry-run makes the invocation inert.
if has "${B_OPEN}wrangler${B_CLOSE}" && has "$MUTATE" && ! has '[-][-]dry-run'; then
  deny "Blocked: this wrangler command changes deployed state, bypassing the CI gate that tests before it uploads. Allowed: whoami, secret list, kv key list, versions list, tail, deploy --dry-run. To ship, open a PR and let CI deploy on merge."
fi

# Direct Cloudflare API writes — the obvious way around the rule above.
if has 'api\.cloudflare\.com' && has "${B_OPEN}(-X|--request)${B_CLOSE}[[:space:]]*(POST|PUT|PATCH|DELETE)"; then
  deny "Blocked: a write to the Cloudflare API is the same production change a wrangler deploy would make. GET is allowed."
fi

# Note: B_CLOSE already consumes the separator, so these use [[:space:]]+ as the
# boundary instead of stacking both — doing both never matched.
has "${B_OPEN}(npm|pnpm|yarn|bun)[[:space:]]+publish" &&
  deny "Blocked: publishing a package is an outward-facing release. Ask the user to run it."

has "${B_OPEN}gh[[:space:]]+(workflow[[:space:]]+run|pr[[:space:]]+merge|release[[:space:]]+(create|delete))" &&
  deny "Blocked: this triggers a production deploy or release. Opening a PR is allowed; merging it is the user's call."

exit 0
