import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { ActivityLogs } from "./pages/ActivityLogs.js";
import { Backups } from "./pages/Backups.js";
import { Dashboard } from "./pages/Dashboard.js";
import { InstanceDetail } from "./pages/InstanceDetail.js";
import { Instances } from "./pages/Instances.js";
import { Nodes } from "./pages/Nodes.js";
import { Settings } from "./pages/Settings.js";
import { Students } from "./pages/Students.js";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: "/",
    element: (
      <Layout>
        <Outlet />
      </Layout>
    ),
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
