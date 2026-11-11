"use client";

import { useEffect, useId, useRef, useState } from "react";

type Pt = [number, number];

/** Courbe lissée qui passe par chaque point. */
function smooth(pts: Pt[]): string {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    // Les points de contrôle restent entre les deux points : la courbe ne descend jamais sous zéro.
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1 = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6));
    const c2 = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${c1} ${p2[0] - (p3[0] - p1[0]) / 6},${c2} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Spark({ values, color }: { values: number[]; color: string }) {
  const id = useId();
  const W = 200;
  const H = 54;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const pts: Pt[] = values.map((v, i) => [
    values.length > 1 ? (i * W) / (values.length - 1) : W / 2,
    8 + (H - 16) * (1 - (mx === mn ? 0.5 : (v - mn) / (mx - mn))),
  ]);
  const d = smooth(pts);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function AreaChart({
  labels,
  longLabels,
  a,
  b,
}: {
  labels: string[];
  longLabels: string[];
  a: number[]; // questions
  b: number[]; // visiteurs
}) {
  const ga = useId();
  const gb = useId();
  const W = 600;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(W);
  const scale = width / W;
  const H = 260;
  const L = 40;
  const R = 14;
  const T = 16;
  const B = 30;
  const n = labels.length;
  const max = niceMax(Math.max(...a, ...b, 1));
  const x = (i: number) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : (W - L - R) / 2);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.ceil(n / 8);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  };

  const series: [number[], string, string][] = [
    [a, "#026701", ga],
    [b, "#E0A800", gb],
  ];

  return (
    <div className="area-wrap" ref={wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Courbes des questions et des visiteurs"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {series.map(([, c, id]) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity=".38" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeDasharray={f ? "4 5" : undefined} />
            <text x={L - 8} y={y(max * f) + 4} textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {series.map(([s, c, id]) => {
          const d = smooth(s.map((v, i) => [x(i), y(v)]));
          return (
            <g key={id}>
              <path d={`${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id})`} />
              <path d={d} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={y(0)} stroke="#04280E" strokeOpacity=".25" strokeWidth="1.5" strokeDasharray="3 4" />
            <circle cx={x(hover)} cy={y(a[hover])} r="6" fill="#fff" stroke="#026701" strokeWidth="3.5" />
            <circle cx={x(hover)} cy={y(b[hover])} r="6" fill="#fff" stroke="#E0A800" strokeWidth="3.5" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="tip"
          style={{
            left: Math.min(Math.max(x(hover) * scale, 80), width - 80),
            top: y(Math.max(a[hover], b[hover])) * scale,
          }}
        >
          <b>{longLabels[hover]}</b>
          <br />
          <i style={{ background: "#3FBF5A" }} />
          {a[hover]} question{a[hover] > 1 ? "s" : ""}
          <br />
          <i style={{ background: "#F2C200" }} />
          {b[hover]} visiteur{b[hover] > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}

export const TOPIC_COLORS = ["#026701", "#3FA34D", "#E0A800", "#F2C94C", "#1F8A70", "#7A0000", "#8C9A90", "#5B7FBF"];

export function Donut({ items, total }: { items: { name: string; n: number }[]; total: number }) {
  const gap = items.length > 1 ? 0.04 : 0;
  // Angle de départ de chaque part
  const starts = items.reduce<number[]>((acc, it, i) => [...acc, (i ? acc[i - 1] : -Math.PI / 2) + (i ? (items[i - 1].n / (total || 1)) * 2 * Math.PI : 0)], []);
  return (
    <svg id="donut" viewBox="0 0 200 200" role="img" aria-label="Répartition des sujets">
      {!items.length && <circle cx="100" cy="100" r="78" fill="none" stroke="var(--soft)" strokeWidth="26" />}
      {items.map((it, i) => {
        const a = starts[i];
        const a1 = a + (it.n / (total || 1)) * 2 * Math.PI;
        const d =
          items.length === 1
            ? undefined
            : arc(100, 100, 78, a + gap / 2, Math.max(a + gap / 2 + 0.001, a1 - gap / 2));
        return d ? (
          <path key={it.name} d={d} fill="none" stroke={TOPIC_COLORS[i % TOPIC_COLORS.length]} strokeWidth="26">
            <title>{`${it.name} : ${it.n}`}</title>
          </path>
        ) : (
          <circle key={it.name} cx="100" cy="100" r="78" fill="none" stroke={TOPIC_COLORS[0]} strokeWidth="26" />
        );
      })}
      <text x="100" y="98" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--ink)">
        {total.toLocaleString("fr-FR")}
      </text>
      <text x="100" y="120" textAnchor="middle" fontSize="13" fill="var(--mute)">
        question{total > 1 ? "s" : ""}
      </text>
    </svg>
  );
}

export function Ring({ pct, color, big }: { pct: number | null; color: string; big?: boolean }) {
  const size = big ? 160 : 120;
  const cx = size / 2;
  const r = cx - (big ? 14 : 12);
  const sw = big ? 16 : 13;
  const L = 2 * Math.PI * r;
  const ref = useRef<SVGCircleElement>(null);
  useEffect(() => {
    if (pct === null || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate(
      [{ strokeDasharray: `0 ${L}` }, { strokeDasharray: `${(L * pct) / 100} ${L}` }],
      { duration: 1100, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [pct, L]);
  return (
    <svg className={big ? "gauge" : undefined} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={pct === null ? "Pas de données" : `${pct} %`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={big ? "rgba(255,255,255,.12)" : "var(--soft)"} strokeWidth={sw} />
      {pct !== null && pct > 0 && (
        <circle
          ref={ref}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${(L * pct) / 100} ${L}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      )}
      <text x={cx} y={cx + (big ? 12 : 9)} textAnchor="middle" fontSize={big ? 36 : 26} fontWeight="700" fill={big ? "#fff" : "var(--ink)"}>
        {pct === null ? "–" : `${pct} %`}
      </text>
    </svg>
  );
}

const HEAT_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function Heat({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="heat">
      <span />
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="h">
          {i * 2}h
        </span>
      ))}
      {grid.map((row, j) => [
        <span key={`d${j}`} className="r">
          {HEAT_DAYS[j]}
        </span>,
        ...row.map((v, i) => (
          <span
            key={`${j}-${i}`}
            className="c"
            title={`${HEAT_DAYS[j]} ${i * 2}h-${i * 2 + 2}h : ${v} question${v > 1 ? "s" : ""}`}
            style={{ background: `color-mix(in srgb, #026701 ${Math.round(6 + (v / max) * 94)}%, #EEF5EC)` }}
          />
        )),
      ])}
    </div>
  );
}
