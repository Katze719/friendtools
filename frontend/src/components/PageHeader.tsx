import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface PageHeaderBackLink {
  to: string;
  label: string;
}

const backNavClassName =
  "inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200";

/**
 * Shared page chrome: optional back link, title + subtitle, and trailing actions.
 * Matches the pattern used across group tools and personal /me pages.
 */
export default function PageHeader({
  backLink,
  title,
  subtitle,
  actions,
}: {
  backLink?: PageHeaderBackLink | null;
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div>
      {backLink ? (
        <Link to={backLink.to} className={backNavClassName}>
          <ArrowLeft className="h-4 w-4" /> {backLink.label}
        </Link>
      ) : null}
      <div
        className={
          backLink
            ? "mt-1 flex flex-wrap items-start justify-between gap-3"
            : "flex flex-wrap items-start justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {actions ?? null}
      </div>
    </div>
  );
}
