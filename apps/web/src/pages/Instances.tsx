import type { InstanceDto, NodeDto, StudentDto } from "@myma/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  MetricCard,
  Modal,
  Spinner,
  StatusBadge,
  Table,
  formatBytes,
  formatRelativeTime,
} from "@myma/ui";
import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  backupInstance,
  createInstance,
  deleteInstance,
  listInstances,
  listNodes,
  listStudents,
  resetInstance,
  restartInstance,
  restoreInstance,
  startInstance,
  stopInstance,
} from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

interface ActionState {
  id: string;
  action: string;
}

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  action: "stop" | "reset" | "delete" | null;
  instance: InstanceDto | null;
  confirmText: string;
}

const initialConfirm: ConfirmState = {
  open: false,
  title: "",
  description: "",
  action: null,
  instance: null,
  confirmText: "Confirm",
};

export function Instances() {
  const navigate = useNavigate();
  const instances = useAsync(listInstances);
  const students = useAsync(listStudents);
  const nodes = useAsync(listNodes);

  const [busy, setBusy] = useState<ActionState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(initialConfirm);
  const [createOpen, setCreateOpen] = useState(false);

  const refreshAll = useCallback(() => {
    instances.refresh();
  }, [instances]);

  const runAction = async (
    instance: InstanceDto,
    action: string,
    fn: (id: string) => Promise<unknown>
  ) => {
    setBusy({ id: instance.id, action });
    try {
      await fn(instance.id);
      refreshAll();
    } finally {
      setBusy(null);
    }
  };

  const promptStop = (instance: InstanceDto) => {
    setConfirm({
      open: true,
      title: "Stop instance",
      description: `This will stop the Moodle instance at ${instance.hostname}. It can be restarted later.`,
      action: "stop",
      instance,
      confirmText: "Stop",
    });
  };

  const promptReset = (instance: InstanceDto) => {
    setConfirm({
      open: true,
      title: "Reset instance",
      description: `Resetting ${instance.hostname} will wipe its database and moodledata, then reinstall Moodle. A safety backup is recommended first.`,
      action: "reset",
      instance,
      confirmText: "Reset",
    });
  };

  const promptDelete = (instance: InstanceDto) => {
    setConfirm({
      open: true,
      title: "Delete instance",
      description: `Deleting ${instance.hostname} will remove its containers, volumes, database, and DNS record. This cannot be undone.`,
      action: "delete",
      instance,
      confirmText: "Delete",
    });
  };

  const handleConfirm = async () => {
    const instance = confirm.instance;
    if (!instance || !confirm.action) return;

    const action = confirm.action;
    setConfirm((current) => ({ ...current, open: false }));

    if (action === "stop") await runAction(instance, "stop", stopInstance);
    if (action === "reset") await runAction(instance, "reset", resetInstance);
    if (action === "delete") await runAction(instance, "delete", deleteInstance);
  };

  const isBusy = (instance: InstanceDto, action: string) =>
    busy?.id === instance.id && busy?.action === action;

  const studentMap = new Map(students.data?.items.map((s) => [s.id, s]));
  const nodeMap = new Map(nodes.data?.items.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Instances</h2>
          <p className="text-sm text-slate-500">
            Manage Moodle instances across your VPS nodes.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Provision new Moodle</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total"
          value={instances.data?.total ?? 0}
          detail={`Active ${instances.data?.items.filter((i) => i.status === "ACTIVE").length ?? 0}`}
        />
        <MetricCard
          label="Provisioning"
          value={instances.data?.items.filter((i) => i.status === "PROVISIONING").length ?? 0}
        />
        <MetricCard
          label="Stopped"
          value={instances.data?.items.filter((i) => i.status === "STOPPED").length ?? 0}
        />
        <MetricCard
          label="Failed"
          value={instances.data?.items.filter((i) => i.status === "FAILED").length ?? 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Instances</CardTitle>
        </CardHeader>
        <CardContent>
          {instances.loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : instances.data?.items.length === 0 ? (
            <EmptyState
              title="No instances"
              description="Provision your first Moodle instance to see it here."
              action={<Button onClick={() => setCreateOpen(true)}>Provision new Moodle</Button>}
            />
          ) : (
            <Table
              columns={[
                {
                  key: "instance",
                  header: "Instance",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => navigate(`/instances/${row.id}`)}
                      className="text-left font-medium text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {row.hostname}
                    </button>
                  ),
                },
                {
                  key: "student",
                  header: "Student",
                  render: (row) => studentMap.get(row.student_id)?.name ?? "—",
                },
                {
                  key: "hostname",
                  header: "Hostname",
                  render: (row) => row.hostname,
                },
                {
                  key: "node",
                  header: "Node",
                  render: (row) => nodeMap.get(row.node_id)?.name ?? "—",
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => <StatusBadge status={row.status} />,
                },
                {
                  key: "version",
                  header: "Moodle Version",
                  render: (row) => row.moodle_version,
                },
                {
                  key: "cpu",
                  header: "CPU",
                  render: (row) => `${row.cpu_limit} cores`,
                },
                {
                  key: "ram",
                  header: "RAM",
                  render: (row) => formatBytes(row.memory_limit),
                },
                {
                  key: "storage",
                  header: "Storage",
                  render: (row) => formatBytes(row.storage_limit),
                },
                {
                  key: "created",
                  header: "Created",
                  render: (row) => formatRelativeTime(row.created_at),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "min-w-[18rem]",
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => window.open(`https://${row.hostname}`, "_blank")}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isBusy(row, "start")}
                        onClick={() => runAction(row, "start", startInstance)}
                      >
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isBusy(row, "stop")}
                        onClick={() => promptStop(row)}
                      >
                        Stop
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isBusy(row, "restart")}
                        onClick={() => runAction(row, "restart", restartInstance)}
                      >
                        Restart
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={isBusy(row, "backup")}
                        onClick={() => runAction(row, "backup", backupInstance)}
                      >
                        Backup
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={isBusy(row, "restore")}
                        onClick={() => runAction(row, "restore", restoreInstance)}
                      >
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={isBusy(row, "reset")}
                        onClick={() => promptReset(row)}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={isBusy(row, "delete")}
                        onClick={() => promptDelete(row)}
                      >
                        Delete
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={instances.data?.items ?? []}
              getRowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm((current) => ({ ...current, open: false }))}
        onConfirm={handleConfirm}
        title={confirm.title}
        description={confirm.description}
        confirmText={confirm.confirmText}
        confirmVariant={confirm.action === "delete" ? "danger" : "primary"}
        loading={!!busy}
      />

      <CreateInstanceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        students={students.data?.items ?? []}
        nodes={nodes.data?.items ?? []}
        onCreated={() => {
          setCreateOpen(false);
          refreshAll();
        }}
      />
    </div>
  );
}

interface CreateInstanceModalProps {
  open: boolean;
  onClose: () => void;
  students: StudentDto[];
  nodes: NodeDto[];
  onCreated: () => void;
}

function CreateInstanceModal({
  open,
  onClose,
  students,
  nodes,
  onCreated,
}: CreateInstanceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const studentId = formData.get("student_id") as string;
    const nodeId = formData.get("node_id") as string;
    const hostname = (formData.get("hostname") as string).trim().toLowerCase();
    const version = formData.get("moodle_version") as string;
    const cpu = Number(formData.get("cpu_limit"));
    const memory = Number(formData.get("memory_limit")) * 1024 ** 2;
    const storage = Number(formData.get("storage_limit")) * 1024 ** 3;

    if (!studentId || !nodeId || !hostname || !version) {
      setError("Student, node, hostname, and version are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createInstance({
        student_id: studentId,
        node_id: nodeId,
        hostname,
        moodle_version: version,
        cpu_limit: cpu,
        memory_limit: memory,
        storage_limit: storage,
      });
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create instance";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Provision new Moodle" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="student_id" className="text-sm font-medium text-slate-700">
              Student
            </label>
            <select
              id="student_id"
              name="student_id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Select a student
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.email}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="node_id" className="text-sm font-medium text-slate-700">
              VPS Node
            </label>
            <select
              id="node_id"
              name="node_id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Select a node
              </option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name} ({node.ip_address})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="hostname" className="text-sm font-medium text-slate-700">
              Hostname
            </label>
            <input
              id="hostname"
              name="hostname"
              type="text"
              placeholder="student.myma.id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="moodle_version" className="text-sm font-medium text-slate-700">
              Moodle Version
            </label>
            <select
              id="moodle_version"
              name="moodle_version"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              defaultValue="4.5.1"
              required
            >
              <option value="4.5.1">Moodle 4.5.1 (recommended)</option>
              <option value="4.4.5">Moodle 4.4.5</option>
              <option value="4.3.8">Moodle 4.3.8</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="cpu_limit" className="text-sm font-medium text-slate-700">
              CPU Limit (cores)
            </label>
            <input
              id="cpu_limit"
              name="cpu_limit"
              type="number"
              step="0.25"
              min="0.25"
              defaultValue="1"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="memory_limit" className="text-sm font-medium text-slate-700">
              RAM Limit (MB)
            </label>
            <input
              id="memory_limit"
              name="memory_limit"
              type="number"
              min="256"
              step="128"
              defaultValue="2048"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="storage_limit" className="text-sm font-medium text-slate-700">
              Storage Limit (GB)
            </label>
            <input
              id="storage_limit"
              name="storage_limit"
              type="number"
              min="5"
              step="1"
              defaultValue="20"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Provision
          </Button>
        </div>
      </form>
    </Modal>
  );
}
