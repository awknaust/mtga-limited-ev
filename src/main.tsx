import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bootstrap first, so the local sheet can override its variables.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import App from "./App";
import { BOX_FEED_BUDGET_MS, fetchBoxPriceFeed } from "./liveBoxPrices";
import { CALENDAR_FEED_BUDGET_MS, fetchCalendarFeed } from "./liveCalendar";
import "./styles.css";

/*
 * Both feeds are fetched *before* the first render, so the page that appears
 * is the one it will keep and never has to be corrected. Neither is a cold
 * request: index.html preloads both URLs, so they have been in flight since
 * the HTML arrived — usually finished before this script has downloaded — and
 * fetch() here is handed those responses rather than starting new ones.
 *
 * Together, not in sequence, which is what keeps this free. They are two KV
 * reads from the same Worker and each carries its own budget, so the wait is
 * the slower of the two rather than the sum, and the worst case is the one
 * second the box feed alone already imposed.
 *
 * Where there is no feed (previews, dev without the proxy, an outage) a fetch
 * resolves to null at once, or after its budget if the Worker hangs, and the
 * app mounts on the copies it shipped with. Either way it mounts once.
 */
const [boxFeed, calendar] = await Promise.all([
  fetchBoxPriceFeed(AbortSignal.timeout(BOX_FEED_BUDGET_MS)),
  fetchCalendarFeed(AbortSignal.timeout(CALENDAR_FEED_BUDGET_MS)),
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App boxFeed={boxFeed} calendar={calendar} />
  </StrictMode>,
);
