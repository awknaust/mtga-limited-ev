import { BUG_REPORT_URL, REPO_URL } from "../report";
import { SITE_NAME } from "../title";

/** Where the source is, how to report a bug, and Wizards' required notice. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="mb-0">
        <a
          className="link-secondary"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          <i className="bi bi-github me-1" aria-hidden="true" />
          Source on GitHub
        </a>
        <span className="mx-2" aria-hidden="true">
          &middot;
        </span>
        <a
          className="link-secondary"
          href={BUG_REPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          <i className="bi bi-bug me-1" aria-hidden="true" />
          Report a bug
        </a>
      </p>
      {/*
        Wizards' Fan Content Policy sets this wording, and it is quoted rather
        than paraphrased — "Not approved/endorsed by Wizards" and the copyright
        line are theirs verbatim, with only the title slotted in. The policy is
        at company.wizards.com/en/legal/fancontentpolicy; the same page is why
        nothing here carries a Wizards logo or mark, which it does not permit.
      */}
      <p className="site-legal mb-0 mt-3">
        {SITE_NAME} is unofficial Fan Content permitted under the{" "}
        <a
          className="link-secondary"
          href="https://company.wizards.com/en/legal/fancontentpolicy"
          target="_blank"
          rel="noreferrer"
        >
          Fan Content Policy
        </a>
        . Not approved/endorsed by Wizards. Portions of the materials used are
        property of Wizards of the Coast. &copy;Wizards of the Coast LLC.
      </p>
    </footer>
  );
}
