import type { ReactNode } from "react";

/**
 * A heading over a block of results.
 *
 * Distinct from `.section-title`, which labels a group of inputs and is sized
 * to sit beside them — small, uppercase, muted. A results block is something
 * you read rather than fill in, so it gets a heading with the weight of one,
 * and the sentence explaining it sits directly underneath instead of as a
 * caption under whatever chart or table follows. A caption below has to be
 * found after the fact; a subtitle is read before the thing it explains.
 */
export function SectionHeading({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Spacing, mostly — these are separated by `mt-4` down a tab. */
  className?: string;
  /** An InfoTip or other adornment for the title line. */
  children?: ReactNode;
}) {
  return (
    <div className={`section-head ${className}`.trimEnd()}>
      <h3 className="section-head-title">
        {title}
        {children}
      </h3>
      {subtitle ? <div className="section-head-sub">{subtitle}</div> : null}
    </div>
  );
}
