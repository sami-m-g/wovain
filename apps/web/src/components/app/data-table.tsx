"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import type { DataGridFeatures } from "@wovain/ui/components/reui/data-grid/data-grid";
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
} from "@wovain/ui/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@wovain/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@wovain/ui/components/reui/data-grid/data-grid-table";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type DataColumn<T extends object> = ColumnDef<DataGridFeatures, T>;

/**
 * A read-only table on ReUI's DataGrid (TanStack Table v9): the runs list
 * and the Insights grids. Strings the grid shows itself come from our
 * messages, so it speaks the merchant's language.
 */
export const DataTable = <T extends object>({
  columns,
  data,
  empty,
  rowId,
}: {
  columns: DataColumn<T>[];
  data: T[];
  empty?: ReactNode;
  rowId: (row: T) => string;
}) => {
  // TanStack Table hands back fresh functions each render, which the React
  // Compiler can't memoise; this component opts out (TanStack's guidance).
  "use no memo";
  const t = useTranslations("Common");
  // oxlint-disable-next-line react/incompatible-library -- opted out above
  const table = useTable({
    columns,
    data,
    features: dataGridFeatures,
    getRowId: rowId,
  });

  return (
    <DataGrid
      emptyMessage={empty ?? t("noData")}
      i18n={{ labels: { empty: t("noData"), loading: t("loading") } }}
      recordCount={data.length}
      table={table}
      tableLayout={{ headerBackground: true, width: "auto" }}
    >
      <DataGridContainer>
        <DataGridScrollArea>
          <DataGridTable />
        </DataGridScrollArea>
      </DataGridContainer>
    </DataGrid>
  );
};
