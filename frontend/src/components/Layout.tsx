import { LogOut, Shield, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import HeaderMenu from "./HeaderMenu";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur pt-safe dark:border-slate-800/70 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-safe py-3">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Users className="h-4 w-4" />
            </span>
            <span className="truncate">friendflow</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>
            {user?.is_admin && (
              <Link
                to="/admin/users"
                className="btn-ghost"
                aria-label={t("layout.admin")}
                title={t("layout.admin")}
              >
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">{t("layout.admin")}</span>
              </Link>
            )}
            {user && (
              <>
                <span className="hidden text-sm text-slate-600 dark:text-slate-300 md:inline">
                  {user.display_name}
                </span>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  aria-label={t("layout.signOut")}
                  title={t("layout.signOut")}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("layout.signOut")}</span>
                </button>
              </>
            )}
            <HeaderMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-safe py-6">
        {children}
      </main>
      <footer className="border-t border-slate-200/70 bg-white/60 pb-safe dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto max-w-5xl px-safe py-3 text-xs text-slate-500 dark:text-slate-400">
          {t("layout.footer")}
        </div>
      </footer>
    </div>
  );
}
