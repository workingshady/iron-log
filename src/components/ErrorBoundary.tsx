import { Component, type ReactNode } from "react";
import { clearScreenCache } from "../lib/api";

/** Never show a white page: catch render crashes, show the error and a one-tap fix. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; retried: boolean }> {
  state = { error: null as Error | null, retried: false };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("Screen crashed:", error);
    // first crash: stale cached data is the usual cause → clear it and try once more automatically
    if (!this.state.retried) {
      clearScreenCache();
      setTimeout(() => this.setState({ error: null, retried: true }), 50);
    }
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, retried: false });
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (!this.state.retried) return null;
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-bad/40 bg-bad/5 p-5 text-sm">
        <div className="text-lg font-semibold text-bad">This screen hit an error</div>
        <p className="mt-1 text-mute">Your logged workouts are safe. Tap below to clear the phone's saved copy and reload.</p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-card2 p-2 text-[11px] text-mute">{String(this.state.error?.message ?? this.state.error)}</pre>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => { clearScreenCache(); location.reload(); }} className="min-h-12 rounded-xl bg-acc font-semibold text-acc-ink">Fix &amp; reload</button>
          <a href="#/" onClick={() => this.setState({ error: null, retried: false })} className="flex min-h-12 items-center justify-center rounded-xl border border-line">Go home</a>
        </div>
      </div>
    );
  }
}
