import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "bootstrap/js/dist/modal";

/**
 * A Bootstrap dialog, bound to whichever element the returned ref lands on.
 *
 * Bootstrap's modal is imperative — an instance per element, constructed once
 * and disposed with it — and every dialog on the page wants the same three
 * things from it: a way to raise it, a way to close it from a handler of its
 * own, and to know whether it is up. Written once here, the dialogs themselves
 * are left as markup and the page keeps only the handle.
 *
 * The element stays where the page puts it in the DOM, which is what a hook
 * buys over the dialog owning its own instance: Bootstrap allows one dialog at
 * a time, so raising one from inside another stacks two backdrops that outlive
 * them both, and keeping every `show()` on the page makes that visible in one
 * file.
 */
/**
 * Destructure this at the call site — `const { ref, show } = useModal()` —
 * rather than keeping the handle whole and reaching into it in the markup.
 * The React Compiler follows the ref through a member access and then treats
 * every other read of the same object as a ref access during render, which
 * bails it out of memoising the component; `react-compiler.test.ts` is what
 * catches that if it comes back.
 */
export type ModalHandle = {
  /** Goes on the `.modal` element — see `Dialog`, which takes it as a prop. */
  ref: React.RefObject<HTMLDivElement | null>;
  show: () => void;
  hide: () => void;
  /**
   * Up, or on its way up: `show`/`hide` rather than `shown`/`hidden`, so a
   * hold taken on this is in place before the first keystroke can land in the
   * dialog and a flush overlaps the closing fade. Done, ×, Esc and a backdrop
   * click all arrive through the same two events.
   */
  open: boolean;
  /**
   * When it last opened, stamped rather than read while rendering: "4 hours
   * ago" is a fact about the moment the dialog was asked for, and the React
   * Compiler is free to memoise a render that read the clock itself. Starts at
   * mount, so a dialog that has never opened still has an answer.
   */
  openedAt: Date;
};

export function useModal(): ModalHandle {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<Modal | null>(null);
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => new Date());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    instance.current = new Modal(el);
    const onShow = () => {
      setOpen(true);
      setOpenedAt(new Date());
    };
    const onHide = () => setOpen(false);
    el.addEventListener("show.bs.modal", onShow);
    el.addEventListener("hide.bs.modal", onHide);
    return () => {
      el.removeEventListener("show.bs.modal", onShow);
      el.removeEventListener("hide.bs.modal", onHide);
      instance.current?.dispose();
      instance.current = null;
    };
  }, []);

  // Stable, so an effect may depend on one without re-firing every render.
  const show = useCallback(() => instance.current?.show(), []);
  const hide = useCallback(() => instance.current?.hide(), []);

  return { ref, show, hide, open, openedAt };
}
