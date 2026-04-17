import { Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function PendingApproval() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-full max-w-md items-center justify-center px-4 py-16">
      <div className="card w-full space-y-4 p-6 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <Hourglass className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">{t("pending.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("pending.body")}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{t("pending.hint")}</p>
        <div className="pt-2">
          <Link to="/login" className="btn-primary inline-flex">
            {t("pending.loginLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
