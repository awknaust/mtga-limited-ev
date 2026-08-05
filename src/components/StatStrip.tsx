import { useCallback, useEffect, useRef, useState } from "react";

import { InfoTip } from "./InfoTip";

/**
 * A row of stat tiles that scrolls sideways when there are more than fit.
 *
 * The tiles used to be a wrapping grid, which is the simpler thing and was the
 * right one while the set was fixed. It stopped being right once the set
 * started depending on the event: a grid gives every tile the same weight, so
 * a fifth and sixth tile either push the charts down the page or wrap into a
 * ragged second row that reads as an afterthought. A strip keeps four in view
 * and puts the rest one arrow away, which makes the *order* the claim — first
 * tile is what the event is about, and the tail is for anyone who wants it.
 *
 * Scrolling is the mechanism rather than paging: the container is an ordinary
 * overflow box, so a trackpad, a touch screen and the keyboard all work
 * without this component knowing about any of them. The arrows are a discovery
 * aid on top, since a hidden scrollbar leaves nothing to say more is there.
 */

export type StatTile = {
  /** Stable identity, so a tile keeps its DOM as the set around it changes. */
  key: string;
  /** Node rather than string, so a tile can carry an icon for what it counts. */
  label: React.ReactNode;
  value: string;
  hint?: React.ReactNode;
  /**
   * A popover spelling out what the figure means, for a reader who does not
   * live in the statistics. The label names the button for a screen reader;
   * the content is the explanation.
   */
  help?: { label: string; content: string };
  /** Bootstrap text colour for the value, where the figure has a sign. */
  tone?: string;
};

export function StatStrip({ tiles, label }: { tiles: StatTile[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  /*
   * Which way there is more to see. Two booleans rather than a scroll offset
   * because that is all the rendering needs, and it changes far less often
   * than the offset does — a scroll event per frame settles into no re-render
   * once an end is reached.
   */
  const [more, setMore] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = track.current;
    /*
     * A strip with no width has not been laid out yet, and answers "is there
     * more to the right" with a yes it cannot support: every tile is nought
     * wide and the content still measures a few pixels, so the arrows appear
     * on a row that fits perfectly well. Declining to answer leaves the state
     * where it was until there is a real measurement to replace it with.
     */
    if (!el || el.clientWidth === 0) return;
    // A pixel of slack at each end: sub-pixel layout leaves `scrollWidth` a
    // hair over `clientWidth` on strips that in fact fit, and a scroll to the
    // end lands fractionally short of the maximum.
    const max = el.scrollWidth - el.clientWidth;
    setMore({ prev: el.scrollLeft > 1, next: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    /*
     * Back to the front whenever the set of tiles changes, which is to say
     * whenever the event does. The leading tile is a claim about what the new
     * event is for, and it is worth nothing if the reader is still parked
     * where the last event's strip left them.
     */
    el.scrollLeft = 0;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    /*
     * The track's own box changes with the window and with the column beside
     * it; its contents change when the event does. The observer catches the
     * first, and `tiles.length` in the deps catches the second — the tiles are
     * a fixed fraction of the width, so nothing but their count can move the
     * scrollable distance.
     *
     * The window listener is the belt to that observer's braces, and it earns
     * its place: a strip mounted into a viewport that has no size yet — a
     * background tab, a pane the host has not drawn — measures nothing, and
     * the observer has been seen to stay quiet through the reflow that gives
     * it one. A resize is the one event certain to arrive in that case.
     */
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      resize.disconnect();
    };
  }, [measure, tiles.length]);

  /** Scroll by a screenful, which is the four tiles that are showing. */
  const page = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth,
      // Honoured here rather than left to the stylesheet, because a scroll
      // asked for in script is animated whatever `scroll-behavior` says.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div
      className={`stat-strip${more.prev ? " has-prev" : ""}${more.next ? " has-next" : ""}`}
    >
      <div
        ref={track}
        className="stat-strip-track"
        /*
         * Focusable because it scrolls: a region that can only be reached with
         * a pointer strands anyone driving the page from the keyboard. The
         * info buttons inside are tab stops too, but tabbing through them
         * only reaches tiles already scrolled into view — this is what pans.
         */
        tabIndex={0}
        role="group"
        aria-label={label}
      >
        {tiles.map((tile) => (
          <div key={tile.key} className="stat-strip-item">
            <div className="stat h-100">
              <div className="stat-label">
                {tile.label}
                {tile.help && (
                  <InfoTip label={tile.help.label} content={tile.help.content} />
                )}
              </div>
              <div className={`stat-value ${tile.tone ?? ""}`}>{tile.value}</div>
              {tile.hint !== undefined && <div className="stat-hint">{tile.hint}</div>}
            </div>
          </div>
        ))}
      </div>
      {/*
        An arrow appears only where it has somewhere to go, so a strip that
        fits shows neither and one scrolled to its end shows only the way back.
        They are positioned outside the flow, so arriving and leaving costs
        nothing in layout — and an arrow that stays put while doing nothing is
        a worse offer than no arrow at all, since the fade beside it is already
        saying whether there is more.
      */}
      {more.prev && (
        <button
          type="button"
          className="btn stat-strip-arrow start"
          onClick={() => page(-1)}
          aria-label={`Scroll ${label} left`}
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
      )}
      {more.next && (
        <button
          type="button"
          className="btn stat-strip-arrow end"
          onClick={() => page(1)}
          aria-label={`Scroll ${label} right`}
        >
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
