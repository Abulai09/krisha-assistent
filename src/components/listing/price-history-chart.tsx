"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export interface PricePoint {
  date: string;
  label: string;
  price: number;
}

const millions = (value: number) => `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;

/** График цены. Показывается только при 2+ наблюдениях — одна точка не является «историей». */
export function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="График изменения цены объявления">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} className="fill-muted-foreground" />
          <YAxis
            tickFormatter={millions}
            tickLine={false}
            axisLine={false}
            width={64}
            fontSize={12}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toLocaleString("ru-RU")} ₸`, "Цена"]}
            labelFormatter={(label) => String(label)}
          />
          <Line type="stepAfter" dataKey="price" stroke="var(--color-foreground)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
