"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DomainMasteryDatum {
  domain: string;
  mastery: number;
  weight: number;
}

const BRAND = "var(--color-brand-600, #2563eb)";

export function DomainMasteryChart({ data }: { data: DomainMasteryDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid horizontal={false} strokeOpacity={0.15} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          opacity={0.6}
        />
        <YAxis
          type="category"
          dataKey="domain"
          width={120}
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          opacity={0.7}
        />
        <Tooltip
          cursor={{ fillOpacity: 0.06 }}
          formatter={(value, _name, item) => [
            `${value}% mastery`,
            `${item?.payload?.domain} · ${item?.payload?.weight}% of exam`,
          ]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-line, #e5e7eb)",
            background: "var(--color-surface, #fff)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="mastery" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.domain} fill={BRAND} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default DomainMasteryChart;
