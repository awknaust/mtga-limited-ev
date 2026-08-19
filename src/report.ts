/**
 * The pre-filled "wrong number" issue.
 *
 * Wizards does not publish the evergreen payout ladders, so they are
 * transcribed from community sites and the in-game screens, and a reader
 * looking at one of them is the best check they get. This is the shortest
 * path from noticing to telling: a GitHub issue form with the event named
 * and the page's own link pasted in, so the report arrives reproducible
 * without the reporter having to say what they had set. It stays a plain
 * link rather than a fetch — the CSP's `connect-src 'self'` allows nothing
 * else, and an issue is written by a person on GitHub in any case.
 *
 * The field names here are the `id`s in `.github/ISSUE_TEMPLATE/wrong-number.yml`,
 * which is how GitHub matches a query parameter to a form field; renaming
 * one there means renaming it here. `title` is GitHub's own parameter and
 * overrides the template's default title.
 *
 * Pure, like `title.ts` and `share.ts`: the caller supplies the link, since
 * only the app knows what the page's state is at the moment of rendering.
 */

/** The repository, as the footer and the issue links name it. */
export const REPO_URL = "https://github.com/awknaust/mtga-limited-ev";

/** The template a bug in the app, rather than a wrong figure, is filed on. */
export const BUG_REPORT_URL = `${REPO_URL}/issues/new?template=bug.yml`;

/**
 * The URL that opens the "wrong number" form filled in for `eventName`,
 * carrying `link` — the app's URL as it stands — so the state being reported
 * can be opened rather than reconstructed.
 */
export const wrongNumberIssueUrl = ({
  eventName,
  link,
}: {
  eventName: string;
  link: string;
}): string => {
  const params = new URLSearchParams({
    template: "wrong-number.yml",
    title: `Wrong number: ${eventName}`,
    event: eventName,
    link,
  });
  return `${REPO_URL}/issues/new?${params}`;
};
