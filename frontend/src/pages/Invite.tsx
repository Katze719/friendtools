import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { groupsApi } from "../api/groups";
import LoadingState from "../components/LoadingState";
import { useAuth } from "../context/AuthContext";

/**
 * Public invite landing: `/i/:code`.
 * - If signed in: join (idempotent on the backend) and open the group.
 * - If signed out: bounce to login; after auth the user returns here and joins.
 */
export default function Invite() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user || !code) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await groupsApi.join(code.trim());
        if (!cancelled) navigate(`/groups/${g.id}`, { replace: true });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : t("common.error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, code, navigate, t]);

  if (loading) {
    return <LoadingState fullHeight />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">{t("invite.joiningTitle")}</h1>
        {error ? (
          <>
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <button
              className="btn-secondary mt-2"
              onClick={() => navigate("/", { replace: true })}
            >
              {t("invite.backToDashboard")}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("invite.joiningSubtitle", { code })}
          </p>
        )}
      </div>
    </div>
  );
}
