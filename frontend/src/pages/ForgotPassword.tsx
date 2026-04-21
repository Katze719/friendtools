import { Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

interface ForgotResponse {
  status: string;
}

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<ForgotResponse>("/api/auth/password/forgot", {
        method: "POST",
        body: { email: email.trim() },
        auth: false,
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("auth.forgot.failed"),
      );
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
        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("auth.forgot.sentTitle")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("auth.forgot.sentBody")}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("auth.forgot.sentHint")}
            </p>
            <div className="pt-2">
              <Link to="/login" className="btn-primary inline-flex">
                {t("auth.forgot.backToLogin")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("auth.forgot.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t("auth.forgot.subtitle")}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="label" htmlFor="email">
                  {t("auth.fields.email")}
                </label>
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
                  ? t("auth.forgot.submitting")
                  : t("auth.forgot.submit")}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <Link
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                to="/login"
              >
                {t("auth.forgot.backToLogin")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
