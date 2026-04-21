import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import InstallAppButton from "../components/InstallAppButton";
import { useAuth } from "../context/AuthContext";
import { useAuthConfig } from "../lib/authConfig";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const { t } = useTranslation();
  const authConfig = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      const to = location.state?.from?.pathname ?? "/";
      navigate(to, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "account_pending") {
        navigate("/pending", { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : t("auth.login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-12">
      <Link
        to="/"
        className="mx-auto mb-6 flex flex-col items-center gap-3 text-slate-900 dark:text-slate-100"
      >
        <img
          src="/favicon-192.png"
          alt="friendflow"
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        />
        <span className="text-xl font-semibold tracking-tight">friendflow</span>
      </Link>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.login.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("auth.login.subtitle")}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="label" htmlFor="email">{t("auth.fields.email")}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <label className="label" htmlFor="password">{t("auth.fields.password")}</label>
              {authConfig?.password_reset_enabled && (
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t("auth.login.forgotPassword")}
                </Link>
              )}
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
          )}

          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("auth.login.noAccount")}{" "}
          <Link
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            to="/register"
            state={location.state}
          >
            {t("auth.login.register")}
          </Link>
        </p>
      </div>
      <div className="mt-4 flex justify-center">
        <InstallAppButton variant="ghost" />
      </div>
    </div>
  );
}
