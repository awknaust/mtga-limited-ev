import { useId } from "react";

/**
 * The chrome every dialog on the page shares: the Bootstrap modal markup, a
 * titled header with its close button, and a footer that dismisses.
 *
 * Raising and closing it is not here — that is `useModal`, whose `ref` this
 * takes. What is here is everything that should look and read the same in all
 * four dialogs, chiefly the title being wired to `aria-labelledby` rather than
 * left to each caller to remember.
 */
export function Dialog({
  ref,
  title,
  size,
  scrollable,
  footer,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  title: React.ReactNode;
  /** Wide, for the two dialogs holding a table rather than a form. */
  size?: "lg";
  scrollable?: boolean;
  /** Replaces the plain Done button, for a dialog that offers a choice. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <div className="modal fade" tabIndex={-1} ref={ref} aria-labelledby={titleId}>
      <div
        className={`modal-dialog modal-dialog-centered${size === "lg" ? " modal-lg" : ""}${
          scrollable ? " modal-dialog-scrollable" : ""
        }`}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title h6 mb-0" id={titleId}>
              {title}
            </h2>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">{children}</div>
          <div className="modal-footer">{footer ?? <DialogDone />}</div>
        </div>
      </div>
    </div>
  );
}

/** The button that closes a dialog, for a footer that carries more than it. */
export function DialogDone() {
  return (
    <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
      Done
    </button>
  );
}
