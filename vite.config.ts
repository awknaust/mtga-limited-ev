import { configDefaults, defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

/*
 * React Compiler memoises every component in `src`, which is why nothing here
 * reaches for `React.memo`. Existing `useMemo` and `useCallback` calls stay:
 * the compiler preserves them deliberately, and React's own guidance is to
 * leave manual memoisation alone in existing code rather than strip it, since
 * removing it changes what the compiler emits. `react-compiler.test.ts` holds
 * the line — it fails if any component stops compiling.
 *
 * `@babel/core` is pinned to 7 on purpose. Under Babel 8 the compiler cannot
 * lower a destructured parameter carrying a default — `{ className = "" }` —
 * and gives up on the whole function with "(BuildHIR::lowerAssignment)
 * Expected object property value to be an LVal, got: AssignmentPattern"
 * (react/react#36868). That silently cost six components here, NumberInput and
 * Tabs among them, and a bailout is invisible in a build log: the bundle just
 * quietly carries less memoisation.
 *
 * Everything else is on latest. Babel 8.0.1 was tried and reverted rather than
 * skipped on the strength of the issue: it still fails, on exactly the five
 * files the test names. Take it when that issue closes, and let the test say
 * whether it is safe rather than assuming — the alternative, moving the six
 * defaults out of their destructuring patterns, does satisfy Babel 8 but
 * spreads a workaround across five components to save one line here.
 */
/*
 * /api is the box-price feed, served in production by the Worker in `worker/`
 * on the app's own origin (the CSP allows nothing else). Dev has no Worker,
 * so by default the fetch fails and the app stands on the copy of the feed it
 * ships (src/data/box-prices.json) — the same behaviour as a preview deploy,
 * and dev never requires the network.
 *
 * To exercise the live feed path, name a proxy target explicitly:
 *
 *     MTGA_EV_API_PROXY=http://localhost:8787 npm run dev   # wrangler dev
 *
 * Deliberately not defaulted to the production origin: a config that quietly
 * points every dev loop at the live site couples development to production —
 * and its request volume to however many dev servers happen to be running.
 * Reaching for prod data should be a choice made per-shell, not a side effect
 * of `npm run dev`.
 */
const apiProxy = process.env.MTGA_EV_API_PROXY;

/*
 * Agent worktrees live in `.claude/worktrees/` and are whole checkouts, so
 * each carries its own copy of `src` — its own copy of every test, and its own
 * `src/__snapshots__/share.compat.test.ts.snap`. Vitest globs the filesystem
 * rather than the git index, so `.gitignore` does not keep them out, and its
 * own defaults exclude only `node_modules` and `.git`. Three worktrees lying
 * around took `npm test` from 26 files to 100, with three quarters of the run
 * executing code main had already moved past and re-checking the compat guard
 * against three stale snapshots at once.
 *
 * Vitest matches these patterns against paths relative to the config root, so
 * this stays correct when the tests are run from *inside* a worktree: there
 * the root is the worktree itself, `src/foo.test.ts` carries no `.claude/` in
 * its relative path, and the only thing skipped is a worktree nested inside
 * that worktree. Do not rewrite it as an absolute path — that form matches
 * the worktree's own prefix and would exclude the entire run from in there.
 */
const AGENT_WORKTREES = "**/.claude/**";

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: apiProxy
    ? { proxy: { "/api": { target: apiProxy, changeOrigin: true } } }
    : undefined,
  test: {
    exclude: [...configDefaults.exclude, AGENT_WORKTREES],
  },
});
