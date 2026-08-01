import { Component, type ReactNode } from "react";
import { t } from "../i18n";

interface State {
  error: Error | null;
}

/**
 * Last line of defense: a render crash must never show a white page or lose
 * the user's diagram — the mermaid code lives in localStorage, so we show it
 * and offer recovery paths.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    let saved = "";
    try {
      saved = localStorage.getItem("graph:code") ?? "";
    } catch {
      // storage unavailable
    }
    return (
      <div className="crash-screen">
        <h2>{t("error.crashTitle")}</h2>
        <pre className="crash-error">{String(this.state.error.stack ?? this.state.error)}</pre>
        <p>{t("error.crashIntro")}</p>
        <textarea className="crash-code" readOnly value={saved} rows={10} />
        <div className="crash-actions">
          <button onClick={() => location.reload()}>{t("error.reload")}</button>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("graph:code");
              } catch {
                // ignore
              }
              location.reload();
            }}
          >
            {t("error.reset")}
          </button>
        </div>
      </div>
    );
  }
}
