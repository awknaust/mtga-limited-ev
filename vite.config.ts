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
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    /*
     * /api is the box-price feed, served in production by the Worker in
     * `worker/` on the app's own origin (the CSP allows nothing else). Dev has
     * no Worker, so the dev server relays the path to production — the browser
     * still sees a same-origin request. Offline, the proxy fails, the app's
     * fetch catches, and the baked-in fallback values stand; dev never
     * *requires* the network.
     */
    proxy: {
      "/api": {
        target: "https://mtga-limited-ev.awknaust.me",
        changeOrigin: true,
      },
    },
  },
});
