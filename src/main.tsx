import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bootstrap first, so the local sheet can override its variables.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import App from "./App";
import { BOX_FEED_BUDGET_MS, fetchBoxPriceFeed } from "./liveBoxPrices";
import "./styles.css";

/*
 * The live box-price feed is fetched *before* the first render, so the page
 * that appears is priced from it and never has to be corrected. It is not a
 * cold request: index.html preloads the same URL, so it has been in flight
 * since the HTML arrived — usually finished before this script has downloaded
 * — and fetch() here is handed that response rather than starting another.
 * Where there is no feed (previews, dev without the proxy, an outage) this
 * resolves to null at once, or after BOX_FEED_BUDGET_MS if the Worker hangs,
 * and the app mounts on the copy of the feed it shipped with. Either way it
 * mounts once, on the answer it will keep.
 */
const feed = await fetchBoxPriceFeed(AbortSignal.timeout(BOX_FEED_BUDGET_MS));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App boxFeed={feed} />
  </StrictMode>,
);
