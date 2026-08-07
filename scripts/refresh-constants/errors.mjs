/**
 * A source could not be reached, or no longer looks the way this script reads
 * it.
 *
 * Its own type so the exit code can separate "the number moved" from "we did
 * not find out". Conflating those would let an outage read as a price crash.
 */
export class SourceError extends Error {
  name = "SourceError";
}
