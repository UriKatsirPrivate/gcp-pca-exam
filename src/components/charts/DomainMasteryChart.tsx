"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DomainMasteryDatum {
  domain: string;
  mastery: number;
  /** Share of the domain's modules completed (0–100). */
  coursework: number;
  weight: number;
}

const BRAND = "var(--color-brand-600, #2563eb)";
const COURSEWORK = "var(--color-coursework, #c2714f)";

export function DomainMasteryChart({ data }: { data: DomainMasteryDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={420}>
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
          formatter={(value, name) => [`${value}%`, name]}
          labelFormatter={(label, items) =>
            `${label} · ${items?.[0]?.payload?.weight}% of exam`
          }
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--color-line, #e5e7eb)",
            background: "var(--color-surface, #fff)",
            fontSize: 12,
          }}
        />
        <Legend
          verticalAlign="top"
          align="left"
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
        />
        <Bar
          name="Mastery"
          dataKey="mastery"
          fill={BRAND}
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
          label={{ position: "right", fontSize: 10, formatter: (v: unknown) => `${v}%` }}
        />
        <Bar
          name="Coursework"
          dataKey="coursework"
          fill={COURSEWORK}
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default DomainMasteryChart;
