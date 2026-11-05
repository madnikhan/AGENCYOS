"use client";

type Series = { name: string; data: number[]; color: string };

const COLORS = {
  semrush: "#c44b3c",
  agency: "#2f7d4c",
  info: "#3b6ea5",
  warn: "#a67c1a",
  muted: "#8a847c",
};

function maxOf(series: Series[], yMax?: number) {
  const m = Math.max(...series.flatMap((s) => s.data), 1);
  return yMax ?? m;
}

export function GroupedBarChart({
  categories,
  series,
  height = 240,
  valuePrefix = "",
  valueSuffix = "",
  yMax,
  horizontal = false,
}: {
  categories: string[];
  series: Series[];
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  yMax?: number;
  horizontal?: boolean;
}) {
  const max = maxOf(series, yMax);
  const pad = { t: 16, r: 12, b: horizontal ? 24 : 56, l: horizontal ? 120 : 36 };
  const w = 560;
  const h = height;
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const groupN = categories.length;
  const seriesN = series.length;

  if (horizontal) {
    const rowH = plotH / groupN;
    const barH = Math.min(14, (rowH * 0.7) / seriesN);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="slide-chart" role="img">
        {categories.map((cat, i) => {
          const y0 = pad.t + i * rowH + rowH / 2;
          return (
            <g key={cat}>
              <text
                x={pad.l - 8}
                y={y0 + 4}
                textAnchor="end"
                className="slide-chart-label"
              >
                {cat}
              </text>
              {series.map((s, si) => {
                const val = s.data[i] ?? 0;
                const bw = (val / max) * plotW;
                const y = y0 - (seriesN * barH) / 2 + si * barH;
                return (
                  <g key={s.name}>
                    <rect
                      x={pad.l}
                      y={y}
                      width={Math.max(bw, 0)}
                      height={barH - 2}
                      fill={s.color}
                      rx={2}
                    />
                    <text
                      x={pad.l + bw + 6}
                      y={y + barH / 2 + 3}
                      className="slide-chart-value"
                    >
                      {valuePrefix}
                      {val}
                      {valueSuffix}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  }

  const groupW = plotW / groupN;
  const barW = Math.min(28, (groupW * 0.7) / seriesN);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="slide-chart" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.t + plotH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={y}
                y2={y}
                className="slide-chart-grid"
              />
            </g>
          );
        })}
        {categories.map((cat, i) => {
          const x0 = pad.l + i * groupW + groupW / 2;
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const val = s.data[i] ?? 0;
                const bh = (val / max) * plotH;
                const x = x0 - (seriesN * barW) / 2 + si * barW;
                return (
                  <g key={s.name}>
                    <rect
                      x={x}
                      y={pad.t + plotH - bh}
                      width={barW - 3}
                      height={bh}
                      fill={s.color}
                      rx={2}
                    />
                  </g>
                );
              })}
              <text
                x={x0}
                y={h - 10}
                textAnchor="middle"
                className="slide-chart-label"
              >
                {cat.length > 14 ? `${cat.slice(0, 12)}…` : cat}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={series} valuePrefix={valuePrefix} valueSuffix={valueSuffix} />
    </div>
  );
}

export function LineChartSvg({
  categories,
  series,
  height = 220,
  valuePrefix = "",
  fill = false,
}: {
  categories: string[];
  series: Series[];
  height?: number;
  valuePrefix?: string;
  fill?: boolean;
}) {
  const max = maxOf(series);
  const pad = { t: 16, r: 12, b: 36, l: 44 };
  const w = 640;
  const h = height;
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const n = categories.length;

  function pt(i: number, v: number) {
    const x = pad.l + (n === 1 ? 0 : (i / (n - 1)) * plotW);
    const y = pad.t + plotH * (1 - v / max);
    return { x, y };
  }

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="slide-chart" role="img">
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + plotH * (1 - t);
          return (
            <line
              key={t}
              x1={pad.l}
              x2={w - pad.r}
              y1={y}
              y2={y}
              className="slide-chart-grid"
            />
          );
        })}
        {series.map((s) => {
          const points = s.data.map((v, i) => pt(i, v));
          const d = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ");
          const area =
            fill && points.length
              ? `${d} L ${points[points.length - 1].x} ${pad.t + plotH} L ${points[0].x} ${pad.t + plotH} Z`
              : null;
          return (
            <g key={s.name}>
              {area && (
                <path d={area} fill={s.color} opacity={0.12} stroke="none" />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={s.color} />
              ))}
            </g>
          );
        })}
        {categories.map((cat, i) => {
          const { x } = pt(i, 0);
          return (
            <text
              key={cat}
              x={x}
              y={h - 10}
              textAnchor="middle"
              className="slide-chart-label"
            >
              {cat}
            </text>
          );
        })}
        <text x={4} y={pad.t + 4} className="slide-chart-label">
          {valuePrefix}
          {max}
        </text>
      </svg>
      <Legend series={series} valuePrefix={valuePrefix} />
    </div>
  );
}

export function PieChartSvg({
  data,
  size = 200,
  donut = false,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  donut?: boolean;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const ir = donut ? r * 0.58 : 0;
  let angle = -Math.PI / 2;

  function arc(start: number, end: number, outer: number, inner: number) {
    const x1 = cx + Math.cos(start) * outer;
    const y1 = cy + Math.sin(start) * outer;
    const x2 = cx + Math.cos(end) * outer;
    const y2 = cy + Math.sin(end) * outer;
    const large = end - start > Math.PI ? 1 : 0;
    if (inner <= 0) {
      return `M ${cx} ${cy} L ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} Z`;
    }
    const ix1 = cx + Math.cos(end) * inner;
    const iy1 = cy + Math.sin(end) * inner;
    const ix2 = cx + Math.cos(start) * inner;
    const iy2 = cy + Math.sin(start) * inner;
    return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
  }

  return (
    <div className="slide-pie-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        {data.map((d) => {
          const sweep = (d.value / total) * Math.PI * 2;
          const start = angle;
          const end = angle + sweep;
          angle = end;
          return (
            <path key={d.label} d={arc(start, end, r, ir)} fill={d.color} />
          );
        })}
        {donut && (
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            className="slide-chart-center"
          >
            {total}
          </text>
        )}
      </svg>
      <ul className="slide-pie-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span style={{ background: d.color }} />
            {d.label} ({Math.round((d.value / total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({
  series,
  valuePrefix = "",
  valueSuffix = "",
}: {
  series: Series[];
  valuePrefix?: string;
  valueSuffix?: string;
}) {
  return (
    <ul className="slide-legend">
      {series.map((s) => (
        <li key={s.name}>
          <span style={{ background: s.color }} />
          {s.name}
          {valuePrefix || valueSuffix ? (
            <em className="muted">
              {" "}
              ({valuePrefix}…{valueSuffix})
            </em>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export { COLORS };
