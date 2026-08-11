/**
 * Fetching, and the error that means "we could not find out".
 *
 * Everything here serves both modules — the constants derivations and the
 * box-price feed — and nothing here knows which site it is talking to.
 */

/**
 * A source could not be reached, or no longer looks the way this code reads
 * it.
 *
 * Its own type so exit codes and handlers can separate "the number moved"
 * from "we did not find out". Conflating those would let an outage read as a
 * price crash.
 */
export class SourceError extends Error {
  override name = "SourceError";
}

/**
 * Names the script and links the repository. Every source here serves
 * anonymous traffic; identifying ourselves honestly is the cheap courtesy
 * that keeps it that way. If a source ever starts refusing this agent, take
 * that as a no and find another source rather than dressing the request up
 * as a browser.
 */
export const USER_AGENT =
  "mtga-limited-ev-refresh/1.0 (+https://github.com/awknaust/mtga-limited-ev)";

const TIMEOUT_MS = 30_000;

export async function request(url: string, opts: { json?: boolean } = {}): Promise<unknown> {
  const json = opts.json ?? false;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: json ? "application/json" : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new SourceError(`${url}: ${(cause as Error).message}`);
  }
  if (!res.ok) throw new SourceError(`${url}: HTTP ${res.status}`);
  return json ? res.json() : res.text();
}
