import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartData, SlideObjectView as ObjView } from '../../crdt/scene';

const PALETTE = ['#1167d4', '#dc2626', '#16a34a', '#a855f7', '#f59e0b', '#0891b2'];

// A chart object rendered with Recharts (MIT, SVG, no canvas, exports cleanly). Data lives on the
// object as { categories, series }; editing happens via the inspector's data grid (LWW per object).
// pointer-events are disabled so the object stays selectable/draggable as a whole.
export function ChartObject({ o }: { o: ObjView }) {
  const { t } = useTranslation();
  // Sample data shown until the user edits the grid (localised, not persisted).
  const sample: ChartData = useMemo(
    () => ({
      categories: [1, 2, 3, 4].map((n) => t('T{{n}}', { n })),
      series: [{ name: t('Série {{n}}', { n: 1 }), values: [12, 19, 9, 22] }],
    }),
    [t],
  );
  const data = o.data && o.data.categories?.length ? o.data : sample;
  const type = o.chartType || 'column';

  // Per-series colour: prefer the imported series colour, else cycle the house palette.
  const colorAt = (i: number) => data.series[i]?.color || PALETTE[i % PALETTE.length];

  const rows = useMemo(
    () =>
      data.categories.map((cat, i) => {
        const row: Record<string, string | number> = { name: cat };
        data.series.forEach((s) => (row[s.name] = s.values[i] ?? 0));
        return row;
      }),
    [data],
  );

  const common = { width: '100%', height: '100%' } as const;

  if (type === 'pie') {
    const s0 = data.series[0];
    const pieData = data.categories.map((cat, i) => ({ name: cat, value: s0?.values[i] ?? 0 }));
    return (
      <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        <ResponsiveContainer {...common}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" outerRadius="80%" label isAnimationActive={false}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Legend />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
      <ResponsiveContainer {...common}>
        {type === 'line' ? (
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            {data.series.map((s, i) => (
              <Line key={s.name} dataKey={s.name} stroke={colorAt(i)} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            {data.series.map((s, i) => (
              <Area key={s.name} dataKey={s.name} stroke={colorAt(i)} fill={colorAt(i)} fillOpacity={0.25} isAnimationActive={false} />
            ))}
          </AreaChart>
        ) : (
          <BarChart
            data={rows}
            layout={type === 'bar' ? 'vertical' : 'horizontal'}
            margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            {type === 'bar' ? (
              <>
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={11} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
              </>
            )}
            <Tooltip />
            <Legend />
            {data.series.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                fill={colorAt(i)}
                stackId={o.stacked ? 'a' : undefined}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
