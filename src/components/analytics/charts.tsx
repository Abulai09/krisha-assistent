"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const thousands = (value: number) => `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс.`;

export function DistrictPriceChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Медианная цена за квадратный метр по районам (данные в таблице ниже)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tickFormatter={thousands} fontSize={12} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={110} fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [`${Number(value).toLocaleString("ru-RU")} ₸/м²`, "Медиана"]} cursor={{ fillOpacity: 0.08 }} />
          <Bar dataKey="value" fill="var(--color-foreground)" fillOpacity={0.75} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Распределение объявлений по цене за квадратный метр">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={32} />
          <Tooltip formatter={(value) => [value, "Объявлений"]} labelFormatter={(label) => `${label} тыс. ₸/м²`} cursor={{ fillOpacity: 0.08 }} />
          <Bar dataKey="count" fill="var(--color-foreground)" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }: { data: { month: string; value: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Динамика медианной цены за квадратный метр по месяцам">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={thousands} fontSize={12} tickLine={false} axisLine={false} width={64} domain={["auto", "auto"]} />
          <Tooltip formatter={(value) => [`${Number(value).toLocaleString("ru-RU")} ₸/м²`, "Медиана"]} />
          <Line dataKey="value" stroke="var(--color-foreground)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
