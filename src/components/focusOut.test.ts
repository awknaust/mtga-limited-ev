import { describe, expect, it } from "vitest";

import { focusLeftControl } from "./focusOut";

/*
 * Plain objects standing in for nodes: this suite has no DOM, and identity is
 * all the predicate reads. `contains` is the only behaviour a root needs.
 */
const node = (name: string) => ({ name }) as unknown as Node;

const body = node("body");
const documentElement = node("html");
const doc = { body, documentElement };

const inside = node("a button inside the panel");
const outside = node("a field elsewhere on the page");
const root = { contains: (n: Node) => n === inside };

describe("focusLeftControl", () => {
  it("says focus left when it landed on something else that holds it", () => {
    expect(focusLeftControl(outside, root, doc)).toBe(true);
  });

  it("says it did not when focus stayed inside the control", () => {
    expect(focusLeftControl(inside, root, doc)).toBe(false);
  });

  /*
   * The iPad bug, pinned. Safari declines to focus a button on tap, so focus
   * falls to the body and `relatedTarget` is the body — outside the control by
   * any structural reading, and the reason every tap on All and None did
   * nothing: the panel closed before the click reached the button.
   */
  it("treats the body as nowhere, not as somewhere outside", () => {
    expect(focusLeftControl(body, root, doc)).toBe(false);
  });

  it("treats the document element as nowhere too", () => {
    expect(focusLeftControl(documentElement, root, doc)).toBe(false);
  });

  it("treats a null target as nowhere, as leaving the page reports", () => {
    expect(focusLeftControl(null, root, doc)).toBe(false);
  });

  it("does not report a control that has unmounted as one focus left", () => {
    // A blur racing an unmount is not a reason to act on the control.
    expect(focusLeftControl(outside, null, doc)).toBe(false);
  });

  it("still answers when a document reports no body at all", () => {
    // `doc.body` is null before the body parses; nothing may equal null except
    // a null target, which is already nowhere.
    expect(focusLeftControl(outside, root, { body: null, documentElement })).toBe(true);
    expect(focusLeftControl(null, root, { body: null, documentElement })).toBe(false);
  });
});
