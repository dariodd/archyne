import { Component, type ReactNode } from "react";

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
        <h2>Something broke while rendering</h2>
        <pre className="crash-error">{String(this.state.error.stack ?? this.state.error)}</pre>
        <p>
          Your diagram is safe — this is its current code. Copy it somewhere if in
          doubt, then try to recover:
        </p>
        <textarea className="crash-code" readOnly value={saved} rows={10} />
        <div className="crash-actions">
          <button onClick={() => location.reload()}>Reload</button>
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
            Reset to sample diagram and reload
          </button>
        </div>
      </div>
    );
  }
}
