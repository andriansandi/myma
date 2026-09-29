import type { ActivityLogDto, InstanceResources } from "@myma/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Spinner,
  StatusBadge,
  formatBytes,
  formatLocalTime,
} from "@myma/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  backupInstance,
  deleteInstance,
  getInstance,
  listActivity,
  resetInstance,
  restartInstance,
  restoreInstance,
  startInstance,
  stopInstance,
} from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function InstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const instanceId = id ?? "";

  const fetchInstance = useCallback(
    () => getInstance(instanceId),
    [instanceId]
  );
  const fetchActivity = useCallback(
    () => listActivity({ instanceId }),
    [instanceId]
  );

  const instance = useAsync(fetchInstance);
  const activity = useAsync(fetchActivity);

  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: (() => Promise<void>) | null;
    confirmText: string;
    variant: "primary" | "danger";
  }>({
    open: false,
    title: "",
    description: "",
    action: null,
    confirmText: "Confirm",
    variant: "primary",
  });

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
      instance.refresh();
      activity.refresh();
    } finally {
      setBusy(null);
    }
  };

  const isBusy = (name: string) => busy === name;

  const openMoodle = () => {
    if (instance.data?.hostname) {
      window.open(`https://${instance.data.hostname}`, "_blank");
    }
  };

  const latest = useMemo<InstanceResources | undefined>(() => {
    if (!instance.data?.resources || instance.data.resources.length === 0)
      return undefined;
    return instance.data.resources.reduce((newest, current) =>
      new Date(current.recorded_at) > new Date(newest.recorded_at)
        ? current
        : newest
    );
  }, [instance.data?.resources]);

  const timeline = useMemo<ActivityLogDto[]>(() => {
    const logs = activity.data?.items.slice() ?? [];
    if (instance.data) {
      logs.push({
        id: `created-${instance.data.id}`,
        actor: "system",
        action: "instance.created",
        instance_id: instance.data.id,
        node_id: instance.data.node_id,
        status: "success",
        error: null,
        metadata: "{}",
        timestamp: instance.data.created_at,
      });
    }
    return logs.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [activity.data?.items, instance.data]);

  const isError = instance.data === undefined && instance.error !== undefined;
  const errorDetail =
    instance.error instanceof Error ? instance.error.message : "Unknown error";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/instances")}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to instances
          </button>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">
              {instance.data?.hostname ?? "Instance"}
            </h2>
            {instance.data && <StatusBadge status={instance.data.status} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={openMoodle}>
            Open Moodle
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={isBusy("start")}
            onClick={() => run("start", () => startInstance(instanceId))}
          >
            Start
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={isBusy("stop")}
            onClick={() =>
              setConfirm({
                open: true,
                title: "Stop instance",
                description:
                  "This will stop the instance. It can be restarted later.",
                action: () => run("stop", () => stopInstance(instanceId)),
                confirmText: "Stop",
                variant: "primary",
              })
            }
          >
            Stop
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={isBusy("restart")}
            onClick={() => run("restart", () => restartInstance(instanceId))}
          >
            Restart
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={isBusy("backup")}
            onClick={() => run("backup", () => backupInstance(instanceId))}
          >
            Backup
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={isBusy("restore")}
            onClick={() => run("restore", () => restoreInstance(instanceId))}
          >
            Restore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={isBusy("reset")}
            onClick={() =>
              setConfirm({
                open: true,
                title: "Reset instance",
                description:
                  "Reset will wipe the database and moodledata, then reinstall Moodle.",
                action: () => run("reset", () => resetInstance(instanceId)),
                confirmText: "Reset",
                variant: "primary",
              })
            }
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={isBusy("delete")}
            onClick={() =>
              setConfirm({
                open: true,
                title: "Delete instance",
                description:
                  "This will permanently remove the instance, its data, and DNS record.",
                action: () =>
                  run("delete", async () => {
                    await deleteInstance(instanceId);
                    navigate("/instances");
                  }),
                confirmText: "Delete",
                variant: "danger",
              })
            }
          >
            Delete
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorDetail}
        </div>
      )}

      {instance.loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : instance.data ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Instance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-y-4 sm:grid-cols-2">
                <DetailItem label="Student" value={instance.data.student?.name ?? "—"} />
                <DetailItem label="Hostname" value={instance.data.hostname} />
                <DetailItem label="Status" value={<StatusBadge status={instance.data.status} />} />
                <DetailItem label="Moodle Version" value={instance.data.moodle_version} />
                <DetailItem label="VPS Node" value={instance.data.node?.name ?? "—"} />
                <DetailItem label="Docker Project" value={instance.data.docker_project} />
                <DetailItem label="Database" value={instance.data.database_name} />
                <DetailItem
                  label="Created"
                  value={formatLocalTime(instance.data.created_at)}
                />
                <DetailItem
                  label="Last Backup"
                  value={
                    instance.data.last_backup_at
                      ? formatLocalTime(instance.data.last_backup_at)
                      : "Never"
                  }
                />
              </dl>

              {instance.data.provision_error && (
                <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p className="font-medium">Provisioning error</p>
                  <p>{instance.data.provision_error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resource Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <ResourceBar
                  label="CPU"
                  usedText={`${latest?.cpu_usage.toFixed(2) ?? "0.00"} / ${instance.data.cpu_limit} cores`}
                  percent={Math.min(
                    100,
                    ((latest?.cpu_usage ?? 0) / instance.data.cpu_limit) * 100
                  )}
                />
                <ResourceBar
                  label="Memory"
                  usedText={`${formatBytes(latest?.memory_usage ?? 0)} / ${formatBytes(
                    instance.data.memory_limit
                  )}`}
                  percent={Math.min(
                    100,
                    ((latest?.memory_usage ?? 0) / instance.data.memory_limit) * 100
                  )}
                />
                <ResourceBar
                  label="Storage"
                  usedText={`${formatBytes(instance.data.storage_used)} / ${formatBytes(
                    instance.data.storage_limit
                  )}`}
                  percent={Math.min(
                    100,
                    (instance.data.storage_used / instance.data.storage_limit) * 100
                  )}
                />
                <DetailItem
                  label="Database Size"
                  value={formatBytes(latest?.db_size ?? 0)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState title="No activity recorded" />
              ) : (
                <ol className="relative ml-3 border-l border-slate-200">
                  {timeline.map((log) => (
                    <li key={log.id} className="mb-6 ml-6 last:mb-0">
                      <span
                        className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${
                          log.status === "success" ? "bg-green-500" : "bg-red-500"
                        }`}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-slate-900">
                        {log.action}
                      </p>
                      <p className="text-xs text-slate-500">
                        {log.actor} · {formatLocalTime(log.timestamp)}
                      </p>
                      {log.error && (
                        <p className="mt-1 text-xs text-red-600">{log.error}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm((current) => ({ ...current, open: false }))}
        onConfirm={() => {
          void confirm.action?.().then(() =>
            setConfirm((current) => ({ ...current, open: false }))
          );
        }}
        title={confirm.title}
        description={confirm.description}
        confirmText={confirm.confirmText}
        confirmVariant={confirm.variant}
        loading={!!busy}
      />
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function ResourceBar({
  label,
  usedText,
  percent,
}: {
  label: string;
  usedText: string;
  percent: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{usedText}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
