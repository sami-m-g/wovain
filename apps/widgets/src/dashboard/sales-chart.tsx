import type { SalesPoint } from "@wovain/shared/dashboard";
import { money } from "@wovain/shared/economics";

// Revenue per period as bars on one axis. The bars wear the kit's secondary
// text token, so they keep their contrast on light and dark surfaces without a
// series color; each bar's <title> is its hover tooltip, and a visually hidden
// table carries the same numbers for screen readers.
const WIDTH = 640;
const HEIGHT = 120;
const GAP = 2;

export const SalesChart = ({ series }: { series: SalesPoint[] }) => {
  const top = Math.max(...series.map((point) => point.revenue), 0);
  const step = WIDTH / Math.max(series.length, 1);
  const first = series[0]?.date ?? "";
  const last = series.at(-1)?.date ?? "";
  return (
    <figure className="m-0 mt-2">
      <svg
        aria-hidden="true"
        className="block h-28 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      >
        <line
          stroke="var(--color-border-subtle)"
          strokeWidth="1"
          x1="0"
          x2={WIDTH}
          y1={HEIGHT - 0.5}
          y2={HEIGHT - 0.5}
        />
        {series.map((point, index) => {
          const scaled = top > 0 ? (point.revenue / top) * (HEIGHT - 4) : 0;
          // A small sale still shows as a sliver.
          const height = point.revenue > 0 ? Math.max(scaled, 2) : 0;
          return (
            <rect
              fill="var(--color-text-secondary)"
              height={height}
              key={point.date}
              rx="2"
              width={Math.max(step - GAP, 1)}
              x={index * step}
              y={HEIGHT - height}
            >
              <title>{`${point.date}: ${money(point.revenue)} revenue, ${String(point.orders)} orders, ${money(point.profit)} profit`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="text-secondary mt-1 flex justify-between text-xs">
        <span>{first}</span>
        <span>{`Peak ${money(top)}`}</span>
        <span>{last}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Revenue, orders and profit per period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Revenue</th>
            <th scope="col">Orders</th>
            <th scope="col">Profit</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{money(point.revenue)}</td>
              <td>{point.orders}</td>
              <td>{money(point.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
