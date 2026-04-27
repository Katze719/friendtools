import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import InstallAppButton from "../components/InstallAppButton";
import InstanceBadge from "../components/InstanceBadge";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await register(email.trim(), displayName.trim(), password);
      if (res.status === "approved") {
        const to = location.state?.from?.pathname ?? "/";
        navigate(to, { replace: true });
      } else {
        navigate("/pending", { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.register.failed"));
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
      <div className="mb-4 flex justify-center">
        <InstanceBadge />
      </div>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("auth.register.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("auth.register.subtitle")}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="label" htmlFor="display_name">{t("auth.fields.displayName")}</label>
            <input
              id="display_name"
              type="text"
              required
              minLength={2}
              maxLength={64}
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
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
            <label className="label" htmlFor="password">{t("auth.fields.password")}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.register.passwordHint")}</p>
          </div>

          {error && (
            <p className="alert-error">{error}</p>
          )}

          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("auth.register.hasAccount")}{" "}
          <Link
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            to="/login"
            state={location.state}
          >
            {t("auth.register.login")}
          </Link>
        </p>
      </div>
      <div className="mt-4 flex justify-center">
        <InstallAppButton variant="ghost" />
      </div>
      <nav className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs text-slate-500 dark:text-slate-400">
        <Link className="hover:text-slate-800 dark:hover:text-slate-200" to="/privacy">
          {t("legal.privacyPolicy")}
        </Link>
        <Link className="hover:text-slate-800 dark:hover:text-slate-200" to="/terms">
          {t("legal.termsOfService")}
        </Link>
      </nav>
    </div>
  );
}
