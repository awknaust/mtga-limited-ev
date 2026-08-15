/**
 * What a results tab shows before its first simulation lands: shimmer blocks
 * roughing out the layout that is coming, so the page keeps its shape
 * instead of jumping when the numbers arrive. Decoration to a screen
 * reader — the status line carries the meaning.
 */
export function ResultsPlaceholder({ variant }: { variant: "event" | "bankroll" }) {
  return (
    <div>
      <p className="visually-hidden" role="status">
        Simulating…
      </p>
      <div aria-hidden="true">
        {variant === "bankroll" ? (
          <>
            <div className="row g-2 mb-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="col-6 col-xl-3">
                  <div className="shimmer shimmer-tile" />
                </div>
              ))}
            </div>
            <div className="shimmer shimmer-chart mb-4" />
            <div className="shimmer shimmer-chart" />
          </>
        ) : (
          <>
            <div className="row g-2 mb-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="col-6 col-xl-4">
                  <div className="shimmer shimmer-tile" />
                </div>
              ))}
            </div>
            <div className="shimmer shimmer-chart mb-4" />
            <div className="shimmer shimmer-chart mb-4" />
            <div className="shimmer shimmer-table" />
          </>
        )}
      </div>
    </div>
  );
}
