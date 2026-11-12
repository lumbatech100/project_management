"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SCurvePoint } from "@/lib/s-curve";

interface Props {
  points: SCurvePoint[];
  hasSchedule: boolean;
}

export function SCurveChart({ points, hasSchedule }: Props) {
  if (!hasSchedule) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Isi tanggal rencana (start/end) per lantai di bawah untuk menampilkan
          kurva S Planned vs Actual.
        </p>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
        <p className="text-sm text-slate-500">Belum ada data kurva S</p>
      </div>
    );
  }

  return (
    <div className="h-80 w-full rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            unit="%"
            width={40}
          />
          <Tooltip
            formatter={(value, name) => {
              const label = name === "planned" ? "Planned" : "Actual";
              if (value == null || value === "") return ["—", label];
              return [`${value}%`, label];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as SCurvePoint | undefined;
              return row?.date || "";
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) =>
              value === "planned" ? "Planned" : "Actual"
            }
          />
          <Line
            type="monotone"
            dataKey="planned"
            name="planned"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke="#0f172a"
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
