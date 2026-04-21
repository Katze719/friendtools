import { CheckCircle2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

interface ResetResponse {
  status: string;
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("auth.reset.errorShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      await api<ResetResponse>("/api/auth/password/reset", {
        method: "POST",
        body: { token, password },
        auth: false,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.reset.failed"));
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
        {done ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("auth.reset.doneTitle")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("auth.reset.doneBody")}
            </p>
            <div className="pt-2">
              <Link to="/login" className="btn-primary inline-flex">
                {t("auth.reset.goToLogin")}
              </Link>
            </div>
          </div>
        ) : !token ? (
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("auth.reset.invalidTitle")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("auth.reset.invalidBody")}
            </p>
            <div className="pt-2">
              <Link to="/forgot-password" className="btn-primary inline-flex">
                {t("auth.reset.requestNew")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("auth.reset.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("auth.reset.subtitle")}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="label" htmlFor="password">
                  {t("auth.reset.newPassword")}
                </label>
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("auth.register.passwordHint")}
                </p>
              </div>
              <div className="space-y-1">
                <label className="label" htmlFor="confirm">
                  {t("auth.reset.confirmPassword")}
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </p>
              )}

              <button
                className="btn-primary w-full"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? t("auth.reset.submitting")
                  : t("auth.reset.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
