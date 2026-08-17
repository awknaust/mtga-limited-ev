import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small "pick one of these" dialog, and the button that opens it.
 *
 * A native `<dialog>` rather than a Bootstrap modal, for three reasons. It
 * draws in the browser's top layer, which puts it beyond the reach of the
 * payout table's horizontal scroller — anything expanding inside that cell is
 * clipped by it. There is one of these per payout row and per column, where a
 * Bootstrap modal would mean an instance to construct and dispose for each.
 * And Bootstrap allows one dialog at a time, while the pickers are opened
 * from inside the custom event's editor, which is one.
 *
 * The focus trap comes with the element. Escape does not, quite — see below.
 */
export function PickerDialog({
  label,
  trigger,
  triggerClassName,
  children,
}: {
  /** The dialog's heading, its accessible name, and the trigger's. */
  label: string;
  /** What the trigger button shows; its name is `label`. */
  trigger: ReactNode;
  triggerClassName: string;
  /** The choices, given the callback that closes the dialog behind them. */
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  /*
   * Open is state, and the element follows it from an effect rather than
   * being shown and hidden by the handlers directly. Two things fall out of
   * that. The choices are rendered in the same commit that opens the dialog,
   * where an inline `showModal()` opened it a frame before its contents
   * existed; and `close` touches no ref, which is what lets it be handed to
   * `children` — the React Compiler refuses a function reaching for a ref
   * when that function is passed to something called during render, and
   * silently gives up on the file rather than failing the build.
   */
  const show = () => setOpen(true);
  const close = () => setOpen(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Guarded both ways: `showModal` on an open dialog throws, and the Escape
    // below closes the element itself, so state can arrive already satisfied.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /*
   * Escape belongs to whichever dialog is on top, and these are drawn over
   * the Bootstrap dialog holding the editor. Bootstrap listens for the key
   * with a plain DOM handler on its own element — an ancestor of this one,
   * since a `<dialog>` draws in the top layer but sits in the tree where it
   * was written — and it is reached before React's, which are delegated from
   * the root. Left alone, one press closed the editor underneath and left the
   * picker standing over the page it had been opened from.
   *
   * So the key is stopped here, in a native listener because a React one is
   * too late for the same reason. Stopping it costs the element's own answer
   * to Escape — closing on it is the *default action* of the keydown, and is
   * skipped along with the propagation that would have carried it — so this
   * closes explicitly, which is also what tells React, through `onClose`.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      el.close();
    };
    el.addEventListener("keydown", onEscape);
    return () => el.removeEventListener("keydown", onEscape);
  }, []);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        onClick={show}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        className="picker-dialog"
        aria-label={label}
        // `close` fires for the Escape above too — this is what keeps React's
        // idea of open in step with the DOM's however it was closed.
        onClose={() => setOpen(false)}
        // The dialog fills its own backdrop, so a click landing on the
        // element itself rather than on its contents is a click outside.
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        {/* Built only while open, so a table of eight rows is not eight
            copies of the choices sitting in the DOM. */}
        {open && (
          <div className="picker-dialog-body">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h2 className="section-title mb-0">{label}</h2>
              <button
                type="button"
                className="btn-close btn-sm"
                aria-label="Close"
                onClick={close}
              />
            </div>
            {children(close)}
          </div>
        )}
      </dialog>
    </>
  );
}
