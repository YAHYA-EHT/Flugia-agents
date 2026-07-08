"use client";

/**
 * Lightweight, dependency-free SVG charts for the Executive Assistant analytics.
 * Deterministic rendering (no random) so SSR/CSR markup matches. Axis labels are
 * plain HTML (never distorted by SVG scaling). Colors default to brand accent.
 */

const ACCENT = "#4cc9f0";

/** Catmull-Rom → cubic-bézier smoothing for a clean, flowing line. */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

// ── Area / line chart ────────────────────────────────────────────────────────
export function AreaChart({
  data,
  labels,
  color = ACCENT,
  height = 168,
}: {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
}) {
  const VB_W = 100;
  const VB_H = 100;
  const padY = 10;
  const max = Math.max(1, ...data);
  const n = data.length;
  const x = (i: number) => (n > 1 ? (i * VB_W) / (n - 1) : VB_W / 2);
  const y = (v: number) => padY + (1 - v / max) * (VB_H - padY * 2);
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = smoothPath(pts);
  const area = `${line} L ${VB_W},${VB_H} L 0,${VB_H} Z`;
  const uid = color.replace("#", "");

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="70%" stopColor={color} stopOpacity="0.06" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* horizontal gridlines */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={VB_W}
              y1={padY + f * (VB_H - padY * 2)}
              y2={padY + f * (VB_H - padY * 2)}
              stroke="currentColor"
              className="text-slate-100 dark:text-slate-800"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 4"
            />
          ))}
          <path d={area} fill={`url(#area-${uid})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* end-point marker (HTML, so it stays a perfect circle) */}
        {n > 0 && (
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[color:var(--dot)] shadow-sm dark:border-slate-900"
            style={{
              left: `${(x(n - 1) / VB_W) * 100}%`,
              top: `${(y(data[n - 1]) / VB_H) * 100}%`,
              // @ts-expect-error custom prop
              "--dot": color,
            }}
          />
        )}
      </div>
      {labels && (
        <div className="mt-2 flex justify-between px-0.5">
          {labels.map((l, i) => (
            <span key={i} className="text-[10px] font-medium text-slate-400">{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bar chart ────────────────────────────────────────────────────────────────
export function BarChart({
  data,
  color = ACCENT,
  height = 150,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group flex h-full flex-1 flex-col items-center gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{d.value}</span>
          {/* track */}
          <div className="relative flex w-full flex-1 items-end justify-center overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/40">
            <div
              className="w-full max-w-[46px] rounded-t-md transition-[height] duration-500 ease-out"
              style={{
                height: `${Math.max(4, (d.value / max) * 100)}%`,
                background: `linear-gradient(to top, ${color}, ${color}cc)`,
                boxShadow: `0 0 0 1px ${color}22`,
              }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] font-medium text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut ────────────────────────────────────────────────────────────────────
export function Donut({
  segments,
  size = 128,
  thickness = 14,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = c * 0.012; // small breathing gap between segments
  const active = segments.filter((s) => s.value > 0);
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          {active.map((s) => {
            const raw = (s.value / total) * c;
            const len = Math.max(0, raw - (active.length > 1 ? gap : 0));
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += raw;
            return el;
          })}
        </svg>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-black leading-none text-slate-900 dark:text-slate-100">{centerLabel}</span>
            {centerSub && <span className="mt-0.5 text-[10px] text-slate-400">{centerSub}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {segments.map((s) => {
          const pct = Math.round((s.value / total) * 100);
          return (
            <div key={s.label} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-[68px] text-xs font-medium text-slate-600 dark:text-slate-300">{s.label}</span>
              <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">{s.value}</span>
              <span className="text-[10px] tabular-nums text-slate-400">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ChartCard: titled container matching the app card style. */
export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
