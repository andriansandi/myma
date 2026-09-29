import type { InstanceDto } from "@myma/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MetricCard,
  Spinner,
  StatusBadge,
  Table,
  formatBytes,
  formatLocalTime,
  formatRelativeTime,
} from "@myma/ui";
import { useNavigate } from "react-router-dom";
import { getDashboardStats, listActivity, listInstances } from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function Dashboard() {
  const navigate = useNavigate();
  const stats = useAsync(getDashboardStats);
  const instances = useAsync(listInstances);
  const activity = useAsync(listActivity);

  const recentInstances: InstanceDto[] =
    instances.data?.items
      .slice()
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5) ?? [];

  const recentActivity = activity.data?.items.slice(0, 8) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>
        <p className="text-sm text-slate-500">
          Overview of your Moodle fleet.
        </p>
      </div>

      {stats.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {stats.error.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Instances" value={stats.data?.total_instances ?? 0} />
        <MetricCard label="Active" value={stats.data?.active ?? 0} />
        <MetricCard label="Provisioning" value={stats.data?.provisioning ?? 0} />
        <MetricCard label="Stopped" value={stats.data?.stopped ?? 0} />
        <MetricCard label="Failed" value={stats.data?.failed ?? 0} />
        <MetricCard label="Total Students" value={stats.data?.total_students ?? 0} />
        <MetricCard label="VPS Nodes" value={stats.data?.total_nodes ?? 0} />
        <MetricCard
          label="Total Storage"
          value={formatBytes(stats.data?.total_storage_bytes ?? 0)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Instances</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => navigate("/instances")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {instances.loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : recentInstances.length === 0 ? (
              <EmptyState
                title="No instances yet"
                description="Provision a Moodle instance to get started."
              />
            ) : (
              <Table
                columns={[
                  {
                    key: "hostname",
                    header: "Instance",
                    render: (row) => (
                      <div>
                        <div className="font-medium text-slate-900">
                          {row.hostname}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.docker_project}
                        </div>
                      </div>
                    ),
                  },
                  { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
                  {
                    key: "version",
                    header: "Version",
                    render: (row) => row.moodle_version,
                  },
                  {
                    key: "created",
                    header: "Created",
                    render: (row) => formatRelativeTime(row.created_at),
                  },
                ]}
                rows={recentInstances}
                getRowKey={(row) => row.id}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-4">
                {recentActivity.map((log) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <div
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        log.status === "success" ? "bg-green-500" : "bg-red-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-slate-900">{log.action}</p>
                      <p className="text-xs text-slate-500">
                        {log.actor} · {formatRelativeTime(log.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-slate-400">
        Last updated: {formatLocalTime(new Date().toISOString())}
      </div>
    </div>
  );
}
