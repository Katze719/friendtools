import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import LoadingState from "./components/LoadingState";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { isLandingModeEnabled } from "./lib/landingMode";
import AdminUsers from "./pages/AdminUsers";
import Dashboard from "./pages/Dashboard";
import GroupHome from "./pages/GroupHome";
import Invite from "./pages/Invite";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import PersonalCalendar from "./pages/PersonalCalendar";
import PersonalShopping from "./pages/PersonalShopping";
import PersonalShoppingList from "./pages/PersonalShoppingList";
import PersonalTasks from "./pages/PersonalTasks";
import Register from "./pages/Register";
import { tools } from "./tools";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending" element={<PendingApproval />} />
      <Route path="/i/:code" element={<Invite />} />
      {/* Root is special: authenticated users get the Dashboard, everyone
          else either sees the public landing page or gets bounced to
          /login depending on VITE_LANDING_MODE. Declared BEFORE the
          catch-all so the exact match wins. */}
      <Route path="/" element={<RootGate />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
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
                <Route path="/me/calendar" element={<PersonalCalendar />} />
                <Route path="/me/shopping" element={<PersonalShopping />} />
                <Route
                  path="/me/shopping/:listId"
                  element={<PersonalShoppingList />}
                />
                <Route path="/me/tasks" element={<PersonalTasks />} />
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

function RootGate() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState fullHeight />;
  }
  if (user) {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    );
  }
  if (isLandingModeEnabled()) {
    return <Landing />;
  }
  return <Navigate to="/login" state={{ from: location }} replace />;
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
