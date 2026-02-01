"use client";

/**
 * ProgressChart - SVG-based line chart showing accuracy trend over time.
 *
 * Uses pure SVG (no charting library) to display accuracy scores
 * from completed scenarios as a connected line graph with data points.
 */

interface DataPoint {
  label: string;
  value: number;
  date: string;
}

interface ProgressChartProps {
  /** Array of accuracy data points ordered chronologically */
  dataPoints: DataPoint[];
  /** Chart title */
  title?: string;
}

export default function ProgressChart({
  dataPoints,
  title = "Accuracy Trend",
}: ProgressChartProps) {
  if (dataPoints.length === 0) {
    return (
      <div className="rounded-xl border border-blue-200 bg-white p-6">
        <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
          {title}
        </div>
        <div className="flex h-48 items-center justify-center">
          <p className="font-serif text-blue-800/40 italic">
            Complete scenarios to see your accuracy trend.
          </p>
        </div>
      </div>
    );
  }

  // Chart dimensions
  const width = 600;
  const height = 200;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Scale values (0-100 for percentage)
  const minY = 0;
  const maxY = 100;

  const xStep =
    dataPoints.length > 1 ? chartWidth / (dataPoints.length - 1) : 0;

  const points = dataPoints.map((dp, i) => {
    const x = paddingLeft + (dataPoints.length > 1 ? i * xStep : chartWidth / 2);
    const y =
      paddingTop +
      chartHeight -
      ((dp.value - minY) / (maxY - minY)) * chartHeight;
    return { x, y, ...dp };
  });

  // Build path for the line
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Build path for the filled area
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Y-axis gridlines
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-6">
      <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
        {title}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ minWidth: "300px" }}
        >
          {/* Grid lines */}
          {gridLines.map((val) => {
            const y =
              paddingTop +
              chartHeight -
              ((val - minY) / (maxY - minY)) * chartHeight;
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#bfdbfe"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? "0" : "4,4"}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-blue-400"
                  fontSize="10"
                  fontFamily="Georgia, serif"
                >
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="#eff6ff" opacity="0.6" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill="#1d4ed8"
                stroke="white"
                strokeWidth="2"
              />
              {/* X-axis label (show first, last, and every few in between) */}
              {(dataPoints.length <= 8 ||
                i === 0 ||
                i === dataPoints.length - 1 ||
                i % Math.ceil(dataPoints.length / 6) === 0) && (
                <text
                  x={p.x}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-blue-400"
                  fontSize="9"
                  fontFamily="Georgia, serif"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
