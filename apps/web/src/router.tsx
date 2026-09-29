import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "./api/client.js";
import { Layout } from "./components/Layout.js";
import { ActivityLogs } from "./pages/ActivityLogs.js";
import { Backups } from "./pages/Backups.js";
import { Dashboard } from "./pages/Dashboard.js";
import { InstanceDetail } from "./pages/InstanceDetail.js";
import { Instances } from "./pages/Instances.js";
import { Login } from "./pages/Login.js";
import { Nodes } from "./pages/Nodes.js";
import { Settings } from "./pages/Settings.js";
import { Students } from "./pages/Students.js";

function ProtectedLayout() {
  return isAuthenticated() ? (
    <Layout>
      <Outlet />
    </Layout>
  ) : (
    <Navigate to="/login" replace />
  );
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "instances", element: <Instances /> },
      { path: "instances/:id", element: <InstanceDetail /> },
      { path: "students", element: <Students /> },
      { path: "nodes", element: <Nodes /> },
      { path: "backups", element: <Backups /> },
      { path: "activity", element: <ActivityLogs /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
