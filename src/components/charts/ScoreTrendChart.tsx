"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ScoreTrendDatum {
  label: string;
  score: number;
}

const BRAND = "var(--color-brand-600, #2563eb)";

export function ScoreTrendChart({ data }: { data: ScoreTrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeOpacity={0.15} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          opacity={0.6}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          opacity={0.6}
          width={40}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, "Score"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-line, #e5e7eb)",
            background: "var(--color-surface, #fff)",
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={BRAND}
          strokeWidth={2}
          dot={{ r: 3, fill: BRAND }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default ScoreTrendChart;
