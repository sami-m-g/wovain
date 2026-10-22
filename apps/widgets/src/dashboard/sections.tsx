import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import type {
  AdRow,
  Dashboard,
  Reconciliation,
} from "@wovain/shared/dashboard";
import { money } from "@wovain/shared/economics";
import type { ReactNode } from "react";

import { moneyText, ratioText } from "./format.ts";

// The dashboard's sections. Every name here comes from the merchant's own
// accounts or wovain's records and renders as plain text.

export const Section = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section aria-label={title} className="border-subtle mt-4 border-t pt-4">
    <h3 className="m-0 text-sm font-medium">{title}</h3>
    {children}
  </section>
);

// Up to four columns, so it fits a phone without scrolling sideways; the
// first column truncates.
export const Table = ({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: { cells: string[]; key: string }[];
}) => (
  <table className="mt-2 w-full table-fixed text-xs">
    <caption className="text-secondary mb-1 text-left">{caption}</caption>
    <thead className="text-secondary">
      <tr>
        {head.map((label, index) => (
          <th
            className={`pb-1 font-normal ${index === 0 ? "w-2/5 text-left" : "text-right"}`}
            key={label}
            scope="col"
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map(({ cells, key }) => (
        <tr className="border-subtle border-t" key={key}>
          {cells.map((cell, index) =>
            index === 0 ? (
              <th
                className="truncate py-1 text-left font-normal"
                key={head[index]}
                scope="row"
                title={cell}
              >
                {cell}
              </th>
            ) : (
              <td className="py-1 text-right" key={head[index]}>
                {cell}
              </td>
            )
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

export const AdTable = ({
  caption,
  rows,
}: {
  caption: string;
  rows: AdRow[];
}) => (
  <Table
    caption={caption}
    head={["Name", "Spend", "ROAS", "CPA"]}
    rows={rows.map((row) => ({
      cells: [
        row.name,
        money(row.spend),
        ratioText(row.roas),
        moneyText(row.cpa),
      ],
      key: row.id,
    }))}
  />
);

export const ReconciliationLine = ({
  reconciliation,
}: {
  reconciliation: Reconciliation;
}) => {
  const { metaPurchases, shopOrders, status } = reconciliation;
  const badge = {
    fail: <Badge color="warning">Sources disagree</Badge>,
    pass: <Badge color="secondary">Sources agree</Badge>,
    unknown: <Badge color="secondary">Too few sales to compare</Badge>,
  }[status];
  return (
    <Section title="Fourthwall vs Meta">
      <div className="mt-1 text-sm">
        {`Fourthwall counted ${String(shopOrders)} ${shopOrders === 1 ? "order" : "orders"} from Meta links; Meta reports ${String(metaPurchases)} ${metaPurchases === 1 ? "purchase" : "purchases"}. `}
        {badge}
      </div>
      {status === "fail" ? (
        <p className="text-secondary m-0 mt-1 text-xs">
          Trust Fourthwall&rsquo;s count. A gap this size usually means the
          pixel or the UTM tags miss some sales.
        </p>
      ) : null}
    </Section>
  );
};

type ProductStatus = Dashboard["products"][number]["status"];
const productBadges: Record<
  Exclude<ProductStatus, "live">,
  { color: "danger" | "secondary"; label: string }
> = {
  draft: { color: "secondary", label: "Draft" },
  hidden: { color: "secondary", label: "Hidden" },
  publishing: { color: "secondary", label: "Publishing" },
  rejected: { color: "danger", label: "Rejected" },
  skipped: { color: "secondary", label: "Skipped" },
};

// Live keeps the campaign widget's green pill (the kit's success badge falls
// under 4.5:1 at this size).
const statusBadge = (status: ProductStatus) => {
  if (status === "live") {
    return (
      <span className="wovain-status-live rounded-full px-2 py-0.5 text-xs font-medium">
        Live
      </span>
    );
  }
  const { color, label } = productBadges[status];
  return <Badge color={color}>{label}</Badge>;
};

export const ProductList = ({
  products,
}: {
  products: Dashboard["products"];
}) => (
  <Section title="Products wovain made">
    <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-sm">
      {products.map((product) => (
        <li className="flex items-center gap-2" key={product.designId}>
          <span className="min-w-0 flex-1 truncate">{product.title}</span>
          {statusBadge(product.status)}
        </li>
      ))}
    </ul>
  </Section>
);

const runLabel = { done: "Done", running: "Running", stopped: "Stopped" };

export const RunList = ({ runs }: { runs: Dashboard["runs"] }) => (
  <Section title="Autopilot runs">
    <ul className="m-0 mt-2 grid list-none gap-3 p-0 text-sm">
      {runs.map((run) => (
        <li key={run.id}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{run.idea}</span>
            <Badge color="secondary">{runLabel[run.status]}</Badge>
          </div>
          <p className="text-secondary m-0 text-xs">
            {`${run.createdAt.slice(0, 10)} · ${money(run.spentUsd)} of fal credit`}
          </p>
          <ul className="text-secondary m-0 mt-1 grid list-none gap-0.5 p-0 text-xs">
            {run.decisions.map((decision) => (
              <li key={`${decision.point}-${decision.subject}`}>
                {`${decision.point}: ${decision.choice} ${decision.subject}. ${decision.reason}`}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </Section>
);

export const OptimizerList = ({
  actions,
}: {
  actions: NonNullable<Dashboard["optimizer"]>;
}) => (
  <Section title="Optimizer">
    <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-sm">
      {actions.map((action) => (
        <li key={`${action.type}-${action.target}`}>
          <span>{`${action.type.replaceAll("_", " ")} · ${action.target} `}</span>
          <Badge color={action.status === "proposed" ? "info" : "secondary"}>
            {action.status === "proposed" ? "Recommended" : action.status}
          </Badge>
          {action.reason === undefined ? null : (
            <p className="text-secondary m-0 text-xs">{action.reason}</p>
          )}
        </li>
      ))}
    </ul>
  </Section>
);
