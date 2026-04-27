import { CalendarPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { googleCalendarApi } from "../api/googleCalendar";
import LoadingState from "../components/LoadingState";
import { useToast } from "../ui/UIProvider";

export default function GoogleCalendarIntegration() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    googleCalendarApi
      .status()
      .then((s) => {
        setConnected(s.connected);
        setCalendarId(s.calendar_id ?? null);
      })
      .catch((e) => {
        setConnected(false);
        setCalendarId(null);
        toast.error(e instanceof ApiError ? e.message : t("common.error"));
      })
      .finally(() => setLoading(false));
  }, [t, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const err = params.get("error");
    const ok = params.get("connected");
    if (err) {
      toast.error(decodeURIComponent(err));
      params.delete("error");
      setParams(params, { replace: true });
    }
    if (ok === "1") {
      toast.success(t("integrations.googleCalendar.connectedToast"));
      params.delete("connected");
      setParams(params, { replace: true });
      reload();
    }
  }, [params, setParams, toast, t, reload]);

  async function onConnect() {
    setBusy(true);
    try {
      const { url } = await googleCalendarApi.authorizeUrl();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await googleCalendarApi.disconnect();
      setConnected(false);
      setCalendarId(null);
      toast.success(t("integrations.googleCalendar.disconnectedToast"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {t("layout.backToDashboard")}
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <CalendarPlus className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("integrations.googleCalendar.title")}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {t("integrations.googleCalendar.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <section className="card space-y-4 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("integrations.googleCalendar.softReadOnly")}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {connected ? (
            <>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                {t("integrations.googleCalendar.statusConnected")}
              </span>
              {calendarId && calendarId !== "primary" ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {calendarId}
                </span>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void onDisconnect()}
              >
                {busy ? t("common.saving") : t("integrations.googleCalendar.disconnect")}
              </button>
            </>
          ) : (
            <>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {t("integrations.googleCalendar.statusDisconnected")}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void onConnect()}
              >
                {busy ? t("common.saving") : t("integrations.googleCalendar.connect")}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
