import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MetricCard,
  Modal,
  Spinner,
  Table,
  formatBytes,
  formatRelativeTime,
} from "@myma/ui";
import { useState, type FormEvent } from "react";
import { listNodes, registerNode } from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function Nodes() {
  const nodes = useAsync(listNodes);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">VPS Nodes</h2>
          <p className="text-sm text-slate-500">
            Bare-metal or VPS hosts that run the Moodle containers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Register node</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Nodes" value={nodes.data?.total ?? 0} />
        <MetricCard
          label="Active"
          value={nodes.data?.items.filter((n) => n.status === "ACTIVE").length ?? 0}
        />
        <MetricCard label="Memory Total" value={formatBytes(nodes.data?.items.reduce((sum, n) => sum + n.memory_total, 0) ?? 0)} />
        <MetricCard label="Storage Total" value={formatBytes(nodes.data?.items.reduce((sum, n) => sum + n.storage_total, 0) ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          {nodes.loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : nodes.data?.items.length === 0 ? (
            <EmptyState
              title="No nodes registered"
              description="Register a VPS node to deploy Moodle instances on it."
              action={<Button onClick={() => setCreateOpen(true)}>Register node</Button>}
            />
          ) : (
            <Table
              columns={[
                { key: "name", header: "Name", render: (row) => row.name },
                { key: "hostname", header: "Hostname", render: (row) => row.hostname },
                { key: "ip", header: "IP Address", render: (row) => row.ip_address },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => {
                    if (row.status === "ACTIVE") return <Badge variant="success">Active</Badge>;
                    if (row.status === "DRAINING") return <Badge variant="warning">Draining</Badge>;
                    return <Badge variant="danger">Offline</Badge>;
                  },
                },
                {
                  key: "cpu",
                  header: "CPU",
                  render: (row) => <ResourceStat used={row.cpu_used} total={row.cpu_total} unit="cores" />,
                },
                {
                  key: "memory",
                  header: "Memory",
                  render: (row) => <ResourceStat used={row.memory_used} total={row.memory_total} formatter={formatBytes} />,
                },
                {
                  key: "storage",
                  header: "Storage",
                  render: (row) => <ResourceStat used={row.storage_used} total={row.storage_total} formatter={formatBytes} />,
                },
                {
                  key: "created",
                  header: "Created",
                  render: (row) => formatRelativeTime(row.created_at),
                },
              ]}
              rows={nodes.data?.items ?? []}
              getRowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      <RegisterNodeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          nodes.refresh();
        }}
      />
    </div>
  );
}

function ResourceStat({
  used,
  total,
  unit,
  formatter,
}: {
  used: number;
  total: number;
  unit?: string;
  formatter?: (value: number) => string;
}) {
  const format = formatter ?? ((value: number) => `${value}${unit ? ` ${unit}` : ""}`);
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div>
      <div className="text-slate-900">
        {format(used)} / {format(total)}
      </div>
      <div className="text-xs text-slate-500">{percent}% used</div>
    </div>
  );
}

interface RegisterNodeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function RegisterNodeModal({ open, onClose, onCreated }: RegisterNodeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const input = {
      name: (formData.get("name") as string).trim(),
      hostname: (formData.get("hostname") as string).trim(),
      ip_address: (formData.get("ip_address") as string).trim(),
      agent_url: (formData.get("agent_url") as string).trim(),
      agent_key_id: (formData.get("agent_key_id") as string).trim(),
      cpu_total: Number(formData.get("cpu_total")),
      memory_total: Number(formData.get("memory_total")) * 1024 ** 3,
      storage_total: Number(formData.get("storage_total")) * 1024 ** 3,
    };

    if (
      !input.name ||
      !input.hostname ||
      !input.ip_address ||
      !input.agent_url ||
      !input.agent_key_id
    ) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await registerNode(input);
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to register node";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Register VPS Node" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="node_name" className="text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="node_name"
              name="name"
              type="text"
              placeholder="sg-01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="node_hostname" className="text-sm font-medium text-slate-700">
              Hostname
            </label>
            <input
              id="node_hostname"
              name="hostname"
              type="text"
              placeholder="sg-01.myma.id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="node_ip" className="text-sm font-medium text-slate-700">
              IP Address
            </label>
            <input
              id="node_ip"
              name="ip_address"
              type="text"
              placeholder="128.199.10.42"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="node_agent_url" className="text-sm font-medium text-slate-700">
              Agent URL
            </label>
            <input
              id="node_agent_url"
              name="agent_url"
              type="url"
              placeholder="https://agent.sg-01.myma.id"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="node_agent_key" className="text-sm font-medium text-slate-700">
            Agent Key ID
          </label>
          <input
            id="node_agent_key"
            name="agent_key_id"
            type="text"
            placeholder="Key identifier (not the secret)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="node_cpu" className="text-sm font-medium text-slate-700">
              CPU Total (cores)
            </label>
            <input
              id="node_cpu"
              name="cpu_total"
              type="number"
              step="1"
              min="1"
              defaultValue="4"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="node_memory" className="text-sm font-medium text-slate-700">
              Memory Total (GB)
            </label>
            <input
              id="node_memory"
              name="memory_total"
              type="number"
              step="1"
              min="1"
              defaultValue="8"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="node_storage" className="text-sm font-medium text-slate-700">
              Storage Total (GB)
            </label>
            <input
              id="node_storage"
              name="storage_total"
              type="number"
              step="1"
              min="1"
              defaultValue="120"
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
            Register node
          </Button>
        </div>
      </form>
    </Modal>
  );
}
