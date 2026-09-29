import { Card, CardContent, CardHeader, CardTitle } from "@myma/ui";

export function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">
          Control-plane configuration.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            MyMA uses an external identity provider for admin sign-in. The
            provider is configured on the server; no secrets are stored in the
            dashboard.
          </p>
          <div className="rounded-md bg-slate-50 px-4 py-3 text-slate-700">
            <span className="font-medium">Provider:</span> Clerk placeholder
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
