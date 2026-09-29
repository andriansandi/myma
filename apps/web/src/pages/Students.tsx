import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Modal,
  Spinner,
  Table,
  formatRelativeTime,
} from "@myma/ui";
import { useState, type FormEvent } from "react";
import { createStudent, listStudents } from "../api/client.js";
import { useAsync } from "../hooks/useAsync.js";

export function Students() {
  const students = useAsync(listStudents);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Students</h2>
          <p className="text-sm text-slate-500">
            People who own independent Moodle instances.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add student</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
        </CardHeader>
        <CardContent>
          {students.loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : students.data?.items.length === 0 ? (
            <EmptyState
              title="No students yet"
              description="Add a student to assign them a Moodle instance."
              action={<Button onClick={() => setCreateOpen(true)}>Add student</Button>}
            />
          ) : (
            <Table
              columns={[
                { key: "name", header: "Name", render: (row) => row.name },
                { key: "email", header: "Email", render: (row) => row.email },
                {
                  key: "status",
                  header: "Status",
                  render: (row) =>
                    row.status === "ACTIVE" ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Suspended</Badge>
                    ),
                },
                {
                  key: "created",
                  header: "Created",
                  render: (row) => formatRelativeTime(row.created_at),
                },
              ]}
              rows={students.data?.items ?? []}
              getRowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      <CreateStudentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          students.refresh();
        }}
      />
    </div>
  );
}

interface CreateStudentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateStudentModal({
  open,
  onClose,
  onCreated,
}: CreateStudentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = (formData.get("name") as string).trim();
    const email = (formData.get("email") as string).trim();

    if (!name || !email) {
      setError("Name and email are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createStudent({ name, email });
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create student";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add student">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="student_name" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="student_name"
            name="name"
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="student_email" className="text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="student_email"
            name="email"
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Add student
          </Button>
        </div>
      </form>
    </Modal>
  );
}
