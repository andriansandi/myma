import type { ReactNode } from "react";
import { Card, CardContent } from "./Card.js";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-slate-900">{value}</span>
          {detail && <span className="text-sm text-slate-500">{detail}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
