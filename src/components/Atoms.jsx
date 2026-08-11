import { useState, useEffect } from "react";

export function GlitchTitle({ children, size = "text-2xl" }) {
  return (
    <h1 className={`${size} font-bold tracking-tight text-emerald-300`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {children}
    </h1>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <div className={`bg-zinc-950/80 border border-emerald-900/50 rounded-lg p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Btn({ children, onClick, disabled, variant = "primary", className = "" }) {
  const base = "px-4 py-2.5 rounded-md font-semibold text-sm tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-black",
    danger: "bg-rose-700 hover:bg-rose-600 text-white",
    ghost: "bg-transparent border border-emerald-800 hover:border-emerald-500 text-emerald-300",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Countdown({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const remaining = Math.max(0, Math.floor((endsAt - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const urgent = remaining <= 15;
  return (
    <div className={`font-mono text-3xl tabular-nums ${urgent ? "text-rose-400 animate-pulse" : "text-emerald-300"}`}>
      {m}:{s.toString().padStart(2, "0")}
    </div>
  );
}
