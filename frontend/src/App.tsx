import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminUsers from "./pages/AdminUsers";
import Dashboard from "./pages/Dashboard";
import GroupHome from "./pages/GroupHome";
import Invite from "./pages/Invite";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import Register from "./pages/Register";
import { tools } from "./tools";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<PendingApproval />} />
      <Route path="/i/:code" element={<Invite />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/groups/:groupId" element={<GroupHome />} />
                {tools.map((tool) =>
                  tool.routes.map((route) => {
                    const Component = route.component;
                    const suffix = route.path === "/" ? "" : route.path;
                    const fullPath =
                      `/groups/:groupId/${tool.basePath}${suffix}`.replace(/\/{2,}/g, "/");
                    return (
                      <Route
                        key={`${tool.id}:${route.path}`}
                        path={fullPath}
                        element={<Component />}
                      />
                    );
                  }),
                )}
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">{t("notFound.subtitle")}</p>
    </div>
  );
}
