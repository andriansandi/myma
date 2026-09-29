import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
}

export function Table<T>({ columns, rows, getRowKey, empty }: TableProps<T>) {
  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 bg-white text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 font-semibold text-slate-700 ${column.className ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => {
            const key = getRowKey(row);
            return (
              <tr key={key} className="hover:bg-slate-50/50">
                {columns.map((column) => (
                  <td
                    key={`${key}-${column.key}`}
                    className={`whitespace-nowrap px-4 py-3 text-slate-700 ${column.className ?? ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
