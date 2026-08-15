import { transformAsync } from "@babel/core";
import { describe, expect, it } from "vitest";

/*
 * A guard on the React Compiler, which `vite.config.ts` turns on for the whole
 * of `src`.
 *
 * The compiler is quiet when it fails. A function it cannot analyse is left
 * exactly as written and the build says nothing, so the only sign is a bundle
 * with less memoisation in it than the last one had — not something anyone
 * reads a diff for. That is how the Babel 8 bailout described in
 * `vite.config.ts` went unnoticed until the compiler was asked directly, and
 * asking directly is all this file does.
 *
 * It runs the compiler over the source rather than through Vite, so it is a
 * proxy for the real pipeline and not the pipeline itself: Vite strips types
 * with oxc before Babel sees a file, where here `@babel/preset-typescript`
 * does it. The compiler and the `@babel/core` under it are the same in both,
 * which is what the failure turned on.
 */

/**
 * Every component file, read as text. `import.meta.glob` rather than `fs`
 * keeps this the only test needing no Node types, and it picks up a new
 * component without anyone remembering to list it here.
 *
 * `main.tsx` is excluded because it holds no component, only the `createRoot`
 * call, and `lib`, `data` and `worker` are outside the glob entirely — by
 * convention they are model, data and worker modules with no React in them.
 * `hooks` is inside it: the compiler memoises `use*` functions the same way
 * it does components, and a hook it silently bails on is the same quiet
 * regression this file exists to catch.
 */
const COMPONENTS: Record<string, string> = import.meta.glob(
  ["./App.tsx", "./components/**/*.tsx", "./hooks/**/*.ts"],
  { query: "?raw", import: "default", eager: true },
);

type Event = {
  kind: string;
  fnName?: string | null;
  fnLoc?: { start?: { line?: number } } | null;
  detail?: { options?: { reason?: string } } | null;
};

/** `<name> at line N: <reason>` — what a failure needs to be acted on. */
function describeFailure(e: Event): string {
  const where = e.fnName ?? `line ${e.fnLoc?.start?.line ?? "?"}`;
  return `${where}: ${e.kind} — ${e.detail?.options?.reason ?? "no reason given"}`;
}

async function compile(file: string, source: string): Promise<Event[]> {
  const events: Event[] = [];
  await transformAsync(source, {
    filename: file,
    configFile: false,
    babelrc: false,
    presets: ["@babel/preset-typescript"],
    plugins: [
      // Named rather than left to the preset, which infers JSX from the file
      // extension on Babel 7 but not on Babel 8. Without it a Babel bump turns
      // this suite into a parse error, which is a loud failure about the wrong
      // thing — the point is to hear what the *compiler* makes of the file.
      "@babel/plugin-syntax-jsx",
      [
        "babel-plugin-react-compiler",
        { logger: { logEvent: (_f: unknown, e: Event) => events.push(e) } },
      ],
    ],
  });
  return events;
}

describe("React Compiler", () => {
  const files = Object.keys(COMPONENTS);

  it.each(files)("compiles every component in %s", async (file) => {
    const events = await compile(file, COMPONENTS[file]);

    // The reason is the useful half of the event, so put it in the message
    // rather than making whoever hits this go and re-run Babel by hand.
    expect(
      events.filter((e) => e.kind !== "CompileSuccess").map(describeFailure),
    ).toEqual([]);

    // Without this an empty file, or a glob that stopped matching, would pass
    // by finding nothing to complain about.
    expect(events.length).toBeGreaterThan(0);
  });

  it("is looking at the components that exist", () => {
    // Cheap check that the glob still resolves, so the suite above cannot
    // silently shrink to nothing.
    expect(files).toContain("./components/Tabs.tsx");
    expect(files.length).toBeGreaterThan(10);
  });
});
