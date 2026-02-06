"use client";

import React from "react";

export const THEME = {
  bg: "#07090D",
  bg2: "#0B0E14",
  card: "rgba(255,255,255,0.04)",
  card2: "rgba(255,255,255,0.06)",
  border: "rgba(226, 198, 128, 0.18)",
  borderSoft: "rgba(148,163,184,0.16)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.42)",
  gold: "#D4AF37",
  gold2: "#F2D27D",
  gold3: "#B68A2A",
  navy: "#1D4ED8",
  navy2: "#60A5FA",
  good: "#22c55e",
  bad: "#ef4444",
};

export const PIE_PALETTE = [THEME.gold, THEME.navy2, "#94a3b8", "#f59e0b", "#38bdf8"];

export function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function MfBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="absolute -top-44 -left-44 h-[560px] w-[560px] rounded-full blur-3xl"
        style={{ background: "rgba(212,175,55,0.16)" }}
      />
      <div
        className="absolute top-10 -right-48 h-[620px] w-[620px] rounded-full blur-3xl"
        style={{ background: "rgba(29,78,216,0.10)" }}
      />
      <div
        className="absolute bottom-0 left-1/4 h-[680px] w-[680px] rounded-full blur-3xl"
        style={{ background: "rgba(242,210,125,0.06)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 50% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0.0) 55%), radial-gradient(900px 700px at 50% 110%, rgba(0,0,0,0.55), rgba(0,0,0,0.92))",
          opacity: 0.9,
        }}
      />
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: THEME.bg, color: THEME.text }}>
      <MfBackground />
      <div className="relative mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className,
  accent = "gold",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: "gold" | "navy" | "good" | "bad" | "neutral";
}) {
  const accentColor =
    accent === "good"
      ? THEME.good
      : accent === "bad"
      ? THEME.bad
      : accent === "navy"
      ? THEME.navy2
      : accent === "neutral"
      ? "rgba(148,163,184,0.55)"
      : THEME.gold;

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl",
        "transition-transform transition-shadow hover:-translate-y-0.5",
        "hover:shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
        className
      )}
      style={{
        borderColor: THEME.border,
        background: `linear-gradient(180deg, ${THEME.card2} 0%, ${THEME.card} 100%)`,
        boxShadow: "0 0 0 1px rgba(226,198,128,0.06) inset",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor} 0%, rgba(226,198,128,0) 72%)`,
          opacity: 0.95,
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "rgba(212,175,55,0.12)" }}
      />

      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            {title && (
              <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div className="mt-1 text-xs" style={{ color: THEME.muted }}>
                {subtitle}
              </div>
            )}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}

      <div className={clsx(title || subtitle || right ? "px-6 pb-6 pt-4" : "p-6")}>{children}</div>
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneColor = tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.text;
  const dotColor = tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.gold;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm" style={{ color: THEME.muted }}>
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: dotColor,
            boxShadow:
              tone === "good"
                ? "0 0 14px rgba(34,197,94,0.35)"
                : tone === "bad"
                ? "0 0 14px rgba(239,68,68,0.35)"
                : "0 0 14px rgba(212,175,55,0.35)",
          }}
        />
        <span>{label}</span>
      </div>

      <div className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: toneColor }}>
        {value}
      </div>

      {sub ? (
        <div className="mt-1 text-xs whitespace-pre-line" style={{ color: THEME.muted }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
