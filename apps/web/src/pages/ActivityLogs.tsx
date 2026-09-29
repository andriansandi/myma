import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Table,
  formatLocalTime,
} from "@myma/ui";
import { useState, type ChangeEvent } from "react";
import { listActivity, listInstances } from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function ActivityLogs() {
  const [filters, setFilters] = useState<{ action?: string; status?: string; instanceId?: string }>({});
  const logs = useAsync(() => listActivity(filters));
  const instances = useAsync(listInstances);

  const instanceMap = new Map(instances.data?.items.map((i) => [i.id, i]));

  const updateAction = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setFilters((current) => ({ ...current, action: value || undefined }));
  };

  const updateStatus = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setFilters((current) => ({ ...current, status: value || undefined }));
  };

  const updateInstance = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    setFilters((current) => ({ ...current, instanceId: value || undefined }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Activity Logs</h2>
        <p className="text-sm text-slate-500">
          Audit trail for instance lifecycle, nodes, and admin actions.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filter by action"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.action ?? ""}
          onChange={updateAction}
        >
          <option value="">All actions</option>
          <option value="instance.created">instance.created</option>
          <option value="instance.provision_completed">instance.provision_completed</option>
          <option value="instance.provision_failed">instance.provision_failed</option>
          <option value="instance.stopped">instance.stopped</option>
          <option value="instance.backup_completed">instance.backup_completed</option>
          <option value="node.health_checked">node.health_checked</option>
        </select>

        <select
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.status ?? ""}
          onChange={updateStatus}
        >
          <option value="">All statuses</option>
          <option value="success">success</option>
          <option value="error">error</option>
        </select>

        <select
          aria-label="Filter by instance"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={filters.instanceId ?? ""}
          onChange={updateInstance}
        >
          <option value="">All instances</option>
          {instances.data?.items.map((instance) => (
            <option key={instance.id} value={instance.id}>
              {instance.hostname}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <Table
              columns={[
                {
                  key: "timestamp",
                  header: "Timestamp",
                  render: (row) => <span className="text-slate-500">{formatLocalTime(row.timestamp)}</span>,
                },
                { key: "action", header: "Action", render: (row) => <span className="font-mono text-xs">{row.action}</span> },
                { key: "actor", header: "Actor", render: (row) => row.actor },
                {
                  key: "instance",
                  header: "Instance",
                  render: (row) =>
                    row.instance_id ? instanceMap.get(row.instance_id)?.hostname ?? "—" : "—",
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) =>
                    row.status === "success" ? (
                      <Badge variant="success">success</Badge>
                    ) : (
                      <Badge variant="danger">error</Badge>
                    ),
                },
                {
                  key: "error",
                  header: "Error",
                  render: (row) => row.error ? <span className="text-red-600">{row.error}</span> : "—",
                },
              ]}
              rows={logs.data?.items ?? []}
              getRowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
