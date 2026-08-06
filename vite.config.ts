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
 * quietly carries less memoisation. Let Dependabot offer Babel 8 again once
 * that issue closes, and check the test before taking it.
 */
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
