import { defineConfig } from "vite";
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
 * so by default the fetch fails and the app stands on its baked-in fallback
 * values — the same behaviour as a preview deploy, and dev never requires the
 * network.
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

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: apiProxy
    ? { proxy: { "/api": { target: apiProxy, changeOrigin: true } } }
    : undefined,
});
