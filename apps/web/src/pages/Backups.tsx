import type { BackupDto } from "@myma/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Spinner,
  Table,
  formatBytes,
  formatLocalTime,
} from "@myma/ui";
import { useState } from "react";
import { listBackups, listInstances, restoreBackup } from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function Backups() {
  const backups = useAsync(listBackups);
  const instances = useAsync(listInstances);
  const instanceMap = new Map(instances.data?.items.map((i) => [i.id, i]));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    backup: BackupDto | null;
  }>({ open: false, backup: null });

  const handleRestore = async (backup: BackupDto) => {
    setBusyId(backup.id);
    try {
      await restoreBackup(backup.id);
      backups.refresh();
    } finally {
      setBusyId(null);
      setConfirm({ open: false, backup: null });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Backups</h2>
        <p className="text-sm text-slate-500">
          Point-in-time backups stored in object storage.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Backups</CardTitle>
        </CardHeader>
        <CardContent>
          {backups.loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : backups.data?.items.length === 0 ? (
            <EmptyState
              title="No backups yet"
              description="Backups appear here after an instance backup completes."
            />
          ) : (
            <Table
              columns={[
                {
                  key: "instance",
                  header: "Instance",
                  render: (row) => instanceMap.get(row.instance_id)?.hostname ?? "—",
                },
                {
                  key: "timestamp",
                  header: "Timestamp",
                  render: (row) => formatLocalTime(row.timestamp),
                },
                {
                  key: "size",
                  header: "Size",
                  render: (row) => formatBytes(row.size),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => {
                    if (row.status === "COMPLETED") return <Badge variant="success">Completed</Badge>;
                    if (row.status === "RUNNING") return <Badge variant="warning">Running</Badge>;
                    return <Badge variant="danger">Failed</Badge>;
                  },
                },
                {
                  key: "location",
                  header: "Location",
                  render: (row) => (
                    <span className="truncate font-mono text-xs text-slate-500">
                      {row.storage_location}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (row) => (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === row.id}
                      disabled={row.status !== "COMPLETED"}
                      onClick={() => setConfirm({ open: true, backup: row })}
                    >
                      Restore
                    </Button>
                  ),
                },
              ]}
              rows={backups.data?.items ?? []}
              getRowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, backup: null })}
        onConfirm={() => {
          if (confirm.backup) void handleRestore(confirm.backup);
        }}
        title="Restore backup"
        description={
          confirm.backup
            ? `This will restore the backup taken at ${formatLocalTime(confirm.backup.timestamp)} over the current instance data.`
            : ""
        }
        confirmText="Restore"
        confirmVariant="primary"
        loading={!!busyId}
      />
    </div>
  );
}
