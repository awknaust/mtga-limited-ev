import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bootstrap first, so the local sheet can override its variables.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
