// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NumberInput, settledValue } from "./NumberInput";

/*
 * The only test here that needs a document, and it needs one because the defect
 * it pins lived entirely in the wiring: which browser event writes to state,
 * and what the box is showing when it does. A test over `settledValue` alone
 * would have passed against the broken component — the old code clamped
 * correctly, it just did it on the wrong event.
 *
 * So the events are dispatched as a browser dispatches them, rather than
 * through a helper that decides for us. A keystroke is `input`; settling is
 * `change`; a spinner or arrow-key step is both, in that order. React listens
 * for `input` at the root and the component listens for `change` on the element
 * itself, and keeping those two distinct is the whole subject.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A field wired to state, as every call site wires it. */
function Field({
  initial,
  onChange,
  min,
  max,
}: {
  initial: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      value={value}
      min={min}
      max={max}
      onChange={(n) => {
        onChange(n);
        setValue(n);
      }}
    />
  );
}

function mount(props: Parameters<typeof Field>[0]): HTMLInputElement {
  act(() => root.render(<Field {...props} />));
  const el = container.querySelector("input");
  if (!el) throw new Error("no input rendered");
  return el;
}

/**
 * Set the box's text the way a keypress does.
 *
 * Through the prototype setter, because React puts its own `value` property on
 * the node to track what it last saw. Assigning `el.value` directly updates
 * that tracker too, and React then decides nothing changed and skips its
 * onChange — the field would sit there ignoring every keystroke.
 */
function setText(el: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, text);
}

/** A keystroke: new text, and the `input` event React reads as onChange. */
const type = (el: HTMLInputElement, text: string) =>
  act(() => {
    setText(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

/** Blur, Enter, or the end of a spinner step — the native `change` event. */
const settle = (el: HTMLInputElement) =>
  act(() => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

/** An arrow-key step, which fires both, `input` first. */
const step = (el: HTMLInputElement, text: string) => {
  type(el, text);
  settle(el);
};

const BOUNDS = { min: 1, max: 200_000 };

describe("NumberInput, bounded", () => {
  it("says nothing while a number is still being typed", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    // Issue #54, reproduction 1, typed a digit at a time as it was measured.
    // The old code reported on every one of these and clamped as it went, so
    // the last zero left the box reading 500000 and the state holding 200000,
    // and it stayed that way until the next thing cleared the draft.
    for (const text of ["5", "50", "500", "5000", "50000", "500000"]) type(el, text);

    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe("500000");
  });

  it("clamps to the cap once the field settles", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    type(el, "500000");
    settle(el);

    expect(onChange.mock.calls).toEqual([[200_000]]);
    expect(el.value).toBe("200000");
  });

  it("puts the cap back in the box even when the held value never moves", () => {
    // Nothing above the component re-renders here — it is already at the cap —
    // so the box is only corrected because the draft cleared underneath it.
    const onChange = vi.fn();
    const el = mount({ initial: 200_000, onChange, ...BOUNDS });

    type(el, "500000");
    settle(el);

    expect(el.value).toBe("200000");
  });

  it("leaves the held value alone when the box is cleared", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    // Issue #54, reproduction 2, and the one that failed silently: clearing the
    // box is how anyone retypes a number. An empty box parsed as 0 and was
    // raised to the minimum, so committing painted a "1" into what looked like
    // an empty field, and the next four digits typed read 15000.
    type(el, "");
    expect(onChange).not.toHaveBeenCalled();

    settle(el);
    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe("50000");
  });

  it("takes the number typed after a clear, and only that", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    type(el, "");
    settle(el);
    // The box is showing 50000 again rather than a stray 1, so this is what
    // reaches it: a fresh number, replacing what it holds.
    type(el, "5000");
    settle(el);

    expect(onChange.mock.calls).toEqual([[5000]]);
    expect(el.value).toBe("5000");
  });

  it("raises a typed zero to the minimum", () => {
    // A typed 0 is an answer, unlike an empty box, so the floor applies to it.
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    type(el, "0");
    settle(el);

    expect(onChange.mock.calls).toEqual([[1]]);
    expect(el.value).toBe("1");
  });

  it("reports a spinner step at once", () => {
    // The arrows are how the corruption was found, and they must stay live:
    // stepping is a finished edit, so it commits on the spot.
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    step(el, "50001");

    expect(onChange.mock.calls).toEqual([[50_001]]);
    expect(el.value).toBe("50001");
  });

  it("rounds a fraction rather than truncating it", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 50_000, onChange, ...BOUNDS });

    type(el, "7.6");
    settle(el);

    expect(onChange.mock.calls).toEqual([[8]]);
  });
});

describe("NumberInput, unbounded", () => {
  it("still reports every keystroke", () => {
    // The gem, gold and payout fields have no cap and nothing to clamp, so
    // they keep answering live — the results move as the number is typed.
    const onChange = vi.fn();
    const el = mount({ initial: 100, onChange, min: 0 });

    type(el, "1");
    type(el, "15");
    type(el, "150");

    expect(onChange.mock.calls).toEqual([[1], [15], [150]]);
    expect(el.value).toBe("150");
  });

  it("reads a cleared box as zero, which is a value it can hold", () => {
    const onChange = vi.fn();
    const el = mount({ initial: 100, onChange, min: 0 });

    type(el, "");
    settle(el);

    expect(onChange.mock.calls).toEqual([[0]]);
    expect(el.value).toBe("0");
  });
});

describe("settledValue", () => {
  const held = 50_000;

  it.each([
    ["", held, "an empty box is an unfinished edit, not a zero"],
    ["   ", held, "and so is whitespace"],
    ["0", 1, "a typed zero is raised to the floor"],
    ["7", 7, "an in-range figure passes through"],
    ["500000", 200_000, "one over the cap is brought down to it"],
    ["-4", 1, "one under the floor is brought up to it"],
    ["7.6", 8, "fractions round"],
    ["abc", held, "and anything unparseable leaves the value alone"],
  ])("%j settles to %i — %s", (text, expected) => {
    expect(settledValue(text, held, 1, 200_000)).toBe(expected);
  });

  it("returns a held value outside the range untouched", () => {
    // A link can carry a figure this field would not accept — share.ts allows a
    // wider structure than the inputs do — and abandoning an edit is not a
    // reason to rewrite it.
    expect(settledValue("", 30, 1, 20)).toBe(30);
  });
});
