import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ChronoMatrix crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen bg-black text-rose-300 flex flex-col items-center justify-center p-6 text-center"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-lg font-semibold mb-2">เกิดข้อผิดพลาด</div>
          <div className="text-xs text-zinc-500 max-w-sm mb-6 break-words">
            {String(this.state.error.message || this.state.error)}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-rose-700 hover:bg-rose-600 text-white text-sm font-semibold"
          >
            รีโหลดหน้านี้
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
