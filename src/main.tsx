import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initI18n } from "./i18n";

// Sets <html lang>/<html dir> and kicks off the catalogue load before the
// first render, so an RTL locale never paints left-to-right first.
initI18n();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
