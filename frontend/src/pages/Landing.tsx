import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Github,
  Globe,
  Lock,
  type LucideIcon,
  MapPin,
  Plane,
  Server,
  Share2,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import InstallAppButton from "../components/InstallAppButton";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { Reveal, useInView } from "../components/Reveal";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Typewriter from "../components/Typewriter";

const GITHUB_URL = "https://github.com/Katze719/friendflow";
const LICENSE_URL = "https://github.com/Katze719/friendflow/blob/main/LICENSE";

/**
 * Public marketing / intro page shown to unauthenticated visitors when
 * `VITE_LANDING_MODE=landing` is set. The top-right CTAs go straight to
 * the real login/register pages so existing users always have a one-click
 * path in.
 */
export default function Landing() {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-full overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ScrollProgress />
      <BackgroundDecor />

      <Header />

      <main className="relative">
        <Hero />
        <TrustBar />
        <Features />
        <Tour />
        <HowItWorks />
        <Faq />
        <Values />
        <FinalCta />
      </main>

      <footer className="relative border-t border-slate-200/70 bg-white/60 dark:border-slate-800/70 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-safe py-6 text-xs text-slate-500 sm:flex-row dark:text-slate-400">
          <span>{t("layout.footer")}</span>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <Github className="h-3.5 w-3.5" />
              {t("landing.nav.github")}
            </a>
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 dark:hover:text-slate-100"
              title={t("landing.license.tooltip")}
            >
              {t("landing.license.short")}
            </a>
            <Link to="/login" className="hover:text-slate-900 dark:hover:text-slate-100">
              {t("landing.nav.signIn")}
            </Link>
            <Link to="/register" className="hover:text-slate-900 dark:hover:text-slate-100">
              {t("landing.nav.signUp")}
            </Link>
            <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-slate-100">
              {t("legal.privacyPolicy")}
            </Link>
            <Link to="/terms" className="hover:text-slate-900 dark:hover:text-slate-100">
              {t("legal.termsOfService")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BackgroundDecor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden"
      >
        {/* Large decorative gradient behind the hero. Kept static on purpose:
            animating a 1100x640 `blur-3xl` layer forces the browser to
            re-rasterize the blur buffer on every frame, which was a major
            source of scroll/paint jank. The smaller floating icons and the
            HeroMock bob still provide ambient motion. */}
        <div className="absolute -top-32 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-400/30 via-sky-300/20 to-fuchsia-300/20 blur-3xl dark:from-brand-500/25 dark:via-sky-500/15 dark:to-fuchsia-500/10" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(ellipse_at_top,theme(colors.slate.200/0.6),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,theme(colors.slate.800/0.4),transparent_60%)]"
      />
      <FloatingAmbientIcons />
    </>
  );
}

/**
 * Subtle decorative icons drifting in the hero background. Pure visual
 * polish, hidden from assistive tech, disabled for reduced-motion users.
 */
function FloatingAmbientIcons() {
  const items: {
    Icon: LucideIcon;
    className: string;
    anim: string;
    delay: string;
  }[] = [
    {
      Icon: Plane,
      className: "left-[6%] top-24 text-sky-500/40 dark:text-sky-400/30",
      anim: "motion-safe:animate-float-slow",
      delay: "0s",
    },
    {
      Icon: Wallet,
      className: "right-[8%] top-36 text-emerald-500/40 dark:text-emerald-400/30",
      anim: "motion-safe:animate-float-slower",
      delay: "1.2s",
    },
    {
      Icon: CalendarDays,
      className:
        "left-[12%] top-[22rem] text-violet-500/35 dark:text-violet-400/25",
      anim: "motion-safe:animate-float-slow",
      delay: "2.6s",
    },
    {
      Icon: ShoppingBasket,
      className:
        "right-[14%] top-[26rem] text-amber-500/40 dark:text-amber-400/25",
      anim: "motion-safe:animate-float-slower",
      delay: "0.4s",
    },
  ];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-[720px] overflow-hidden md:block"
    >
      {items.map(({ Icon, className, anim, delay }, i) => (
        <Icon
          key={i}
          className={`absolute h-10 w-10 ${className} ${anim}`}
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}

/**
 * Scroll progress bar. Reads layout on every native scroll event but writes
 * the result straight to a CSS variable via rAF - so React never re-renders
 * while scrolling and the DOM is touched at most once per animation frame.
 */
function ScrollProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, el.scrollTop / total)) : 0;
      bar.style.transform = `scaleX(${p})`;
    };
    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0.5"
    >
      <div
        ref={barRef}
        className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand-500 via-sky-500 to-fuchsia-500 will-change-transform"
      />
    </div>
  );
}

function Header() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur pt-safe dark:border-slate-800/60 dark:bg-slate-950/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-safe py-3">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
        >
          <img
            src="/favicon-192.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
          />
          <span>friendflow</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 sm:flex">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm"
            aria-label={t("landing.nav.github")}
            title={t("landing.nav.github")}
          >
            <Github className="h-4 w-4" />
            <span className="hidden md:inline">{t("landing.nav.github")}</span>
          </a>
          <Link
            to="/login"
            className="btn-ghost text-sm"
            aria-label={t("landing.nav.signIn")}
          >
            {t("landing.nav.signIn")}
          </Link>
          <Link
            to="/register"
            className="btn-primary text-sm"
            aria-label={t("landing.nav.signUp")}
          >
            {t("landing.nav.signUp")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();
  const phrases = t("landing.hero.titlePhrases", {
    returnObjects: true,
    defaultValue: [t("landing.hero.title")],
  }) as string[];
  const bulletKeys = ["bullet1", "bullet2", "bullet3", "bullet4"] as const;
  return (
    <section className="mx-auto max-w-6xl px-safe pt-14 pb-10 sm:pt-20 sm:pb-16">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Reveal direction="up" durationMs={500}>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/70 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800/60 dark:bg-brand-900/30 dark:text-brand-200">
              <Sparkles className="h-3.5 w-3.5 motion-safe:animate-pulse" />
              {t("landing.hero.eyebrow")}
            </span>
          </Reveal>
          <Reveal direction="up" delayMs={100}>
            <h1 className="mt-5 min-h-[2.4em] text-4xl font-semibold tracking-tight sm:min-h-[2.3em] sm:text-5xl lg:min-h-[2.2em] lg:text-6xl">
              <Typewriter
                phrases={Array.isArray(phrases) ? phrases : [t("landing.hero.title")]}
                ariaLabel={t("landing.hero.title")}
                className="bg-gradient-to-br from-slate-900 via-brand-700 to-slate-600 bg-[length:200%_auto] bg-clip-text text-transparent motion-safe:animate-shimmer dark:from-white dark:via-brand-200 dark:to-slate-300"
              />
            </h1>
          </Reveal>
          <Reveal direction="up" delayMs={200}>
            <p className="mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              {t("landing.hero.subtitle")}
            </p>
          </Reveal>
          <Reveal direction="up" delayMs={300}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                className="btn-primary group px-5 py-2.5 text-base shadow-sm hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                {t("landing.hero.ctaPrimary")}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
              </Link>
              <Link to="/login" className="btn-secondary px-5 py-2.5 text-base">
                {t("landing.hero.ctaSecondary")}
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-4 py-2.5 text-base"
                aria-label={t("landing.hero.ctaGithub")}
              >
                <Github className="h-4 w-4" />
                {t("landing.hero.ctaGithub")}
              </a>
              <InstallAppButton variant="ghost" />
            </div>
          </Reveal>
          <ul className="mt-8 grid max-w-xl gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {bulletKeys.map((k, i) => (
              <li key={k}>
                <Reveal direction="up" delayMs={400 + i * 80}>
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{t(`landing.hero.${k}`)}</span>
                  </span>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
        <Reveal direction="right" delayMs={150} durationMs={700}>
          <HeroMock />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Stylised, static product "screenshot" built in pure CSS so the landing
 * page ships no marketing binaries and adapts to dark mode automatically.
 */
function HeroMock() {
  const { t } = useTranslation();
  const rows: {
    icon: LucideIcon;
    accent: string;
    title: string;
    subtitle: string;
    amount?: string;
  }[] = [
    {
      icon: Plane,
      accent: "bg-sky-500",
      title: t("landing.mock.trip.title"),
      subtitle: t("landing.mock.trip.subtitle"),
    },
    {
      icon: Wallet,
      accent: "bg-emerald-500",
      title: t("landing.mock.split.title"),
      subtitle: t("landing.mock.split.subtitle"),
      amount: "€ 138,40",
    },
    {
      icon: CalendarDays,
      accent: "bg-violet-500",
      title: t("landing.mock.calendar.title"),
      subtitle: t("landing.mock.calendar.subtitle"),
    },
    {
      icon: ShoppingBasket,
      accent: "bg-amber-500",
      title: t("landing.mock.shopping.title"),
      subtitle: t("landing.mock.shopping.subtitle"),
    },
  ];
  return (
    <div className="group/mock relative motion-safe:animate-float-slow">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-400/30 via-sky-400/20 to-fuchsia-400/20 blur-2xl motion-safe:animate-drift-soft dark:from-brand-500/20 dark:via-sky-500/15 dark:to-fuchsia-500/15"
      />
      <div className="card overflow-hidden p-0 shadow-xl ring-slate-200/50 transition duration-500 group-hover/mock:shadow-2xl group-hover/mock:-translate-y-1 motion-reduce:group-hover/mock:translate-y-0 dark:ring-slate-700/40">
        <div className="flex items-center gap-1.5 border-b border-slate-200/70 bg-slate-50 px-4 py-2.5 dark:border-slate-800/70 dark:bg-slate-900/80">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate text-xs text-slate-500 dark:text-slate-400">
            friendflow / lisbon-crew
          </span>
        </div>
        <div className="space-y-3 p-5">
          {rows.map((r, i) => (
            <Reveal
              key={r.title}
              direction="right"
              delayMs={350 + i * 120}
              durationMs={500}
            >
              <MockRow
                icon={r.icon}
                accent={r.accent}
                title={r.title}
                subtitle={r.subtitle}
                amount={r.amount}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockRow({
  icon: Icon,
  accent,
  title,
  subtitle,
  amount,
}: {
  icon: LucideIcon;
  accent: string;
  title: string;
  subtitle: string;
  amount?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      {amount && (
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {amount}
        </span>
      )}
    </div>
  );
}

function TrustBar() {
  const { t } = useTranslation();
  const items: { icon: LucideIcon; key: string }[] = [
    { icon: Lock, key: "privacy" },
    { icon: Smartphone, key: "pwa" },
    { icon: Globe, key: "multiLang" },
    { icon: Server, key: "selfHosted" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-safe pb-4">
      <Reveal direction="up">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/70 bg-white/60 p-4 text-sm text-slate-600 sm:grid-cols-4 dark:border-slate-800/70 dark:bg-slate-900/50 dark:text-slate-300">
          {items.map(({ icon: Icon, key }, i) => (
            <Reveal key={key} direction="up" delayMs={i * 80} durationMs={500}>
              <div className="group/trust flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-600 transition-transform duration-300 group-hover/trust:scale-110 group-hover/trust:rotate-6 motion-reduce:group-hover/trust:transform-none dark:text-brand-400" />
                <span>{t(`landing.trust.${key}`)}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Features() {
  const { t } = useTranslation();
  const features: { id: string; icon: LucideIcon; accent: string }[] = [
    { id: "splitwise", icon: Wallet, accent: "bg-emerald-500" },
    { id: "trips", icon: Plane, accent: "bg-sky-500" },
    { id: "calendar", icon: CalendarDays, accent: "bg-violet-500" },
    { id: "shopping", icon: ShoppingBasket, accent: "bg-amber-500" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-safe py-16 sm:py-20">
      <RevealHeading
        eyebrow={t("landing.features.eyebrow")}
        title={t("landing.features.title")}
        subtitle={t("landing.features.subtitle")}
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ id, icon: Icon, accent }, i) => (
          <Reveal key={id} direction="up" delayMs={i * 90} durationMs={600}>
            <div className="card group/feat flex h-full flex-col gap-3 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:hover:translate-y-0">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-300 group-hover/feat:-rotate-6 group-hover/feat:scale-110 motion-reduce:group-hover/feat:transform-none ${accent}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold">{t(`landing.features.${id}.title`)}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t(`landing.features.${id}.body`)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const steps: { icon: LucideIcon; id: string }[] = [
    { icon: Users, id: "step1" },
    { icon: Share2, id: "step2" },
    { icon: Sparkles, id: "step3" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-safe py-16 sm:py-20">
      <RevealHeading
        eyebrow={t("landing.how.eyebrow")}
        title={t("landing.how.title")}
        subtitle={t("landing.how.subtitle")}
      />
      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, id }, i) => (
          <li key={id}>
            <Reveal direction="up" delayMs={i * 130} durationMs={650}>
              <div className="card group/step relative flex h-full flex-col gap-3 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:hover:translate-y-0">
                <span className="absolute -top-3 left-5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white shadow ring-4 ring-white transition-transform duration-300 group-hover/step:scale-110 motion-reduce:group-hover/step:transform-none dark:ring-slate-950">
                  {i + 1}
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-transform duration-300 group-hover/step:rotate-6 motion-reduce:group-hover/step:transform-none dark:bg-brand-900/40 dark:text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold">{t(`landing.how.${id}.title`)}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t(`landing.how.${id}.body`)}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Values() {
  const { t } = useTranslation();
  const items: { icon: LucideIcon; id: string }[] = [
    { icon: Lock, id: "privacy" },
    { icon: Smartphone, id: "pwa" },
    { icon: Globe, id: "open" },
    { icon: Server, id: "selfHosted" },
  ];
  return (
    <section className="relative border-y border-slate-200/70 bg-white/60 dark:border-slate-800/70 dark:bg-slate-900/40">
      <div className="mx-auto max-w-6xl px-safe py-16 sm:py-20">
        <RevealHeading
          eyebrow={t("landing.values.eyebrow")}
          title={t("landing.values.title")}
          subtitle={t("landing.values.subtitle")}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, id }, i) => (
            <Reveal key={id} direction="up" delayMs={i * 90} durationMs={600}>
            <div className="group/val flex flex-col gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/90 text-white transition-transform duration-300 group-hover/val:-rotate-6 group-hover/val:scale-105 motion-reduce:group-hover/val:transform-none dark:bg-white/10">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold">{t(`landing.values.${id}.title`)}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t(`landing.values.${id}.body`)}
              </p>
              {id === "selfHosted" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/sh inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                  >
                    <Github className="h-4 w-4" />
                    {t("landing.values.selfHosted.cta")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/sh:translate-x-0.5 motion-reduce:group-hover/sh:translate-x-0" />
                  </a>
                  <a
                    href={LICENSE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    title={t("landing.license.tooltip")}
                  >
                    {t("landing.license.short")}
                  </a>
                </div>
              )}
            </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useTranslation();
  const ids = ["cost", "data", "mobile", "invite"] as const;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-3xl px-safe py-16 sm:py-20">
      <RevealHeading
        eyebrow={t("landing.faq.eyebrow")}
        title={t("landing.faq.title")}
        subtitle={t("landing.faq.subtitle")}
        centered
      />
      <Reveal direction="up" delayMs={100}>
        <div className="mt-8 divide-y divide-slate-200/70 rounded-2xl border border-slate-200/70 bg-white/70 dark:divide-slate-800/70 dark:border-slate-800/70 dark:bg-slate-900/50">
          {ids.map((id, i) => {
            const isOpen = open === i;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                aria-expanded={isOpen}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`landing.faq.${id}.q`)}</p>
                  <div
                    className={`grid overflow-hidden text-sm text-slate-600 transition-all duration-300 ease-out motion-reduce:transition-none dark:text-slate-300 ${
                      isOpen
                        ? "mt-2 grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <p className="min-h-0 overflow-hidden">
                      {t(`landing.faq.${id}.a`)}
                    </p>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-slate-700 dark:text-slate-400 ${
                    isOpen ? "rotate-45 bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" : ""
                  }`}
                >
                  +
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-safe pb-20">
      <Reveal direction="up" durationMs={700}>
        <div className="relative overflow-hidden rounded-3xl border border-brand-200/70 bg-gradient-to-br from-brand-600 to-brand-500 px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16 dark:border-brand-800/60">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/20 blur-3xl motion-safe:animate-drift-soft"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-fuchsia-300/20 blur-3xl motion-safe:animate-float-slower"
          />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">
                {t("landing.finalCta.title")}
              </h2>
              <p className="mt-2 max-w-xl text-brand-50/90">
                {t("landing.finalCta.subtitle")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                to="/register"
                className="group/cta inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow transition duration-200 hover:bg-brand-50 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0"
              >
                {t("landing.finalCta.ctaPrimary")}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-1 motion-reduce:group-hover/cta:translate-x-0" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition duration-200 hover:bg-white/10"
              >
                {t("landing.finalCta.ctaSecondary")}
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/**
 * Stitched-together visual tour. Each row pairs a short pitch with a
 * faux app window so visitors can scan the product in pictures, no login
 * required. Every mock is pure markup + Tailwind - no bitmap assets.
 */
function Tour() {
  const { t } = useTranslation();
  const items: { id: string; eyebrowKey: string; mock: JSX.Element }[] = [
    { id: "splitwise", eyebrowKey: "splitwise", mock: <MockSplitwise /> },
    { id: "trips", eyebrowKey: "trips", mock: <MockTrip /> },
    { id: "calendar", eyebrowKey: "calendar", mock: <MockCalendar /> },
    { id: "shopping", eyebrowKey: "shopping", mock: <MockShopping /> },
    { id: "tasks", eyebrowKey: "tasks", mock: <MockTasks /> },
  ];
  return (
    <section className="mx-auto max-w-6xl px-safe py-16 sm:py-20">
      <RevealHeading
        eyebrow={t("landing.tour.eyebrow")}
        title={t("landing.tour.title")}
        subtitle={t("landing.tour.subtitle")}
        centered
      />
      <div className="mt-14 space-y-16 sm:space-y-24">
        {items.map((item, idx) => (
          <TourRow
            key={item.id}
            idx={idx}
            id={item.id}
            mock={item.mock}
          />
        ))}
      </div>
    </section>
  );
}

function TourRow({
  idx,
  id,
  mock,
}: {
  idx: number;
  id: string;
  mock: JSX.Element;
}) {
  const { t } = useTranslation();
  const reversed = idx % 2 === 1;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
      <Reveal
        direction={reversed ? "right" : "left"}
        durationMs={700}
        className={reversed ? "lg:order-2" : ""}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          {t(`landing.tour.${id}.eyebrow`)}
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t(`landing.features.${id}.title`)}
        </h3>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {t(`landing.tour.${id}.body`)}
        </p>
        <ul className="mt-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {(["b1", "b2", "b3"] as const).map((k, i) => (
            <li key={k}>
              <Reveal direction="up" delayMs={150 + i * 80} durationMs={500}>
                <span className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{t(`landing.tour.${id}.${k}`)}</span>
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal
        direction={reversed ? "left" : "right"}
        delayMs={100}
        durationMs={800}
        className={reversed ? "lg:order-1" : ""}
      >
        <div className="group/frame transition-transform duration-500 hover:-translate-y-1 motion-reduce:hover:translate-y-0">
          {mock}
        </div>
      </Reveal>
    </div>
  );
}

/**
 * Chrome-less browser-window wrapper shared by every tour mockup. The
 * soft blurred gradient behind the frame is what makes the screenshots
 * pop against the background without us having to ship an actual image.
 */
function MockFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-400/20 via-sky-400/15 to-fuchsia-400/15 blur-2xl dark:from-brand-500/15 dark:via-sky-500/10 dark:to-fuchsia-500/10"
      />
      <div className="card overflow-hidden p-0 shadow-xl ring-slate-200/50 dark:ring-slate-700/40">
        <div className="flex items-center gap-1.5 border-b border-slate-200/70 bg-slate-50 px-4 py-2.5 dark:border-slate-800/70 dark:bg-slate-900/80">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate text-xs text-slate-500 dark:text-slate-400">
            {title}
          </span>
        </div>
        <div className="space-y-3 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function MockSplitwise() {
  const { t } = useTranslation();
  const youLabel = t("landing.tour.you");
  const [frameRef, frameInView] = useInView<HTMLDivElement>({ threshold: 0.25 });

  // Four members spaced evenly around a circle - the same layout the live
  // CashflowGraph uses, just at a smaller scale. Positions computed once.
  const W = 320;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const r = 74;
  const nodeR = 22;

  type NodeDef = {
    id: string;
    name: string;
    initials: string;
    balance: number;
    me?: boolean;
  };
  const nodes: NodeDef[] = [
    { id: "anna", name: "Anna", initials: "A", balance: 1840 },
    { id: "ben", name: "Ben", initials: "B", balance: -1250 },
    { id: "you", name: youLabel, initials: "Y", balance: 4230, me: true },
    { id: "tom", name: "Tom", initials: "T", balance: -4820 },
  ];
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    pos.set(n.id, {
      x: cx + r * Math.cos(angles[i]),
      y: cy + r * Math.sin(angles[i]),
    });
  });

  const edges: { from: string; to: string; amount: string }[] = [
    { from: "tom", to: "you", amount: "42,30 €" },
    { from: "ben", to: "anna", amount: "12,50 €" },
  ];

  return (
    <MockFrame title="friendflow / wg-finanzen">
      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50 p-3 dark:from-emerald-950/40 dark:to-sky-950/30">
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          {t("landing.tour.splitwise.balanceLabel")}
        </p>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-200">
            +42,30 €
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t("splitwise.overview.positive")}
          </p>
        </div>
      </div>

      <div
        ref={frameRef}
        className="relative rounded-xl border border-slate-200/70 bg-white/70 p-2 dark:border-slate-800/70 dark:bg-slate-900/60"
        data-in-view={frameInView ? "true" : "false"}
      >
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("landing.tour.splitwise.graphLabel")}
          </span>
          <span className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-800">
            <span className="rounded bg-brand-600 px-1.5 py-0.5 text-white">
              {t("landing.tour.splitwise.modeSimplified")}
            </span>
            <span className="px-1.5 py-0.5 text-slate-500 dark:text-slate-400">
              {t("landing.tour.splitwise.modeDirect")}
            </span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={t("splitwise.overview.graph.aria")}
        >
          <defs>
            <marker
              id="tour-cashflow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path
                d="M0,0 L10,5 L0,10 z"
                className="fill-slate-500 dark:fill-slate-300"
              />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const from = pos.get(e.from)!;
            const to = pos.get(e.to)!;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const x1 = from.x + ux * nodeR;
            const y1 = from.y + uy * nodeR;
            const x2 = to.x - ux * nodeR;
            const y2 = to.y - uy * nodeR;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const nx = -uy;
            const ny = ux;
            const bulge = 22;
            const ctrlX = midX + nx * bulge;
            const ctrlY = midY + ny * bulge;
            const labelX = midX + nx * (bulge + 2);
            const labelY = midY + ny * (bulge + 2);
            const touchesMe = e.from === "you" || e.to === "you";
            return (
              <g key={i}>
                <path
                  d={`M ${x1},${y1} Q ${ctrlX},${ctrlY} ${x2},${y2}`}
                  fill="none"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={frameInView ? 0 : 1}
                  style={{
                    transition: "stroke-dashoffset 1.1s ease-out",
                    transitionDelay: `${300 + i * 250}ms`,
                  }}
                  className={
                    touchesMe
                      ? "stroke-brand-500 dark:stroke-brand-400"
                      : "stroke-slate-400 dark:stroke-slate-500"
                  }
                  strokeWidth={touchesMe ? 2 : 1.4}
                  markerEnd="url(#tour-cashflow-arrow)"
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-700 stroke-white text-[10px] font-medium tabular-nums dark:fill-slate-100 dark:stroke-slate-900"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  style={{ paintOrder: "stroke" }}
                >
                  {e.amount}
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const positive = n.balance > 0;
            const fillClass = positive
              ? "fill-emerald-100 dark:fill-emerald-900/60"
              : n.balance < 0
                ? "fill-rose-100 dark:fill-rose-900/60"
                : "fill-slate-100 dark:fill-slate-800";
            const strokeClass = n.me
              ? "stroke-brand-500 dark:stroke-brand-400"
              : positive
                ? "stroke-emerald-500 dark:stroke-emerald-400"
                : "stroke-rose-500 dark:stroke-rose-400";
            const dirX = (p.x - cx) / (Math.hypot(p.x - cx, p.y - cy) || 1);
            const dirY = (p.y - cy) / (Math.hypot(p.x - cx, p.y - cy) || 1);
            const nameX = p.x + dirX * (nodeR + 14);
            const nameY = p.y + dirY * (nodeR + 14);
            return (
              <g key={n.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={nodeR}
                  className={`${fillClass} ${strokeClass}`}
                  strokeWidth={n.me ? 2.2 : 1.6}
                />
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-100"
                >
                  {n.initials}
                </text>
                <text
                  x={nameX}
                  y={nameY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-slate-700 text-[10px] dark:fill-slate-200"
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </MockFrame>
  );
}

function MockTrip() {
  const { t } = useTranslation();
  const days: { day: string; items: { time: string; title: string }[] }[] = [
    {
      day: t("landing.tour.trips.day1"),
      items: [
        { time: "16:40", title: t("landing.tour.trips.item1") },
        { time: "18:00", title: t("landing.tour.trips.item2") },
      ],
    },
    {
      day: t("landing.tour.trips.day2"),
      items: [
        { time: "10:00", title: t("landing.tour.trips.item3") },
        { time: "20:00", title: t("landing.tour.trips.item4") },
      ],
    },
  ];

  return (
    <MockFrame title="friendflow / lisbon-crew">
      <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 p-3 dark:from-sky-950/40 dark:to-indigo-950/30">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
          <Plane className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {t("landing.mock.trip.title")}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="mr-1 inline h-3 w-3" />
            Lisboa · Jun 7 - Jun 10
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {days.map((d) => (
          <div key={d.day}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {d.day}
            </p>
            <ul className="space-y-1">
              {d.items.map((it) => (
                <li
                  key={it.title}
                  className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="w-10 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {it.time}
                  </span>
                  <span className="truncate font-medium">{it.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800/70 dark:bg-slate-900/60">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {t("landing.tour.trips.budgetLabel")}
          </span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            820 / 1.000 €
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-sky-500"
            style={{ width: "82%" }}
          />
        </div>
      </div>
    </MockFrame>
  );
}

function MockCalendar() {
  const { t } = useTranslation();
  const dayLabels = [
    t("landing.tour.calendar.d1"),
    t("landing.tour.calendar.d2"),
    t("landing.tour.calendar.d3"),
    t("landing.tour.calendar.d4"),
    t("landing.tour.calendar.d5"),
    t("landing.tour.calendar.d6"),
    t("landing.tour.calendar.d7"),
  ];
  // Start the mock month on a Wednesday so the layout feels real without
  // depending on the current date; mark a handful of days with event dots.
  const days = Array.from({ length: 35 }, (_, i) => i - 2);
  const eventDays = new Set([5, 12, 14, 20, 27]);
  const highlight = 20;

  return (
    <MockFrame title="friendflow / calendar">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">
          {t("landing.tour.calendar.month")}
        </p>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {t("landing.tour.calendar.hint")}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {dayLabels.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((n) => {
          if (n < 1 || n > 30) {
            return <span key={`empty-${n}`} className="h-8" />;
          }
          const hasEvent = eventDays.has(n);
          const isHighlight = n === highlight;
          return (
            <div
              key={n}
              className={`relative flex h-8 flex-col items-center justify-center rounded-md text-xs ${
                isHighlight
                  ? "bg-brand-600 font-semibold text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {n}
              {hasEvent && !isHighlight && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-violet-500" />
              )}
              {isHighlight && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-white/80" />
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <CalendarEventRow
          color="bg-violet-500"
          day={t("landing.tour.calendar.eventDay")}
          title={t("landing.tour.calendar.eventTitle")}
          time="19:00"
        />
        <CalendarEventRow
          color="bg-sky-500"
          day={t("landing.tour.calendar.eventDay2")}
          title={t("landing.tour.calendar.eventTitle2")}
          time="10:30"
          fromTrip
        />
      </div>
    </MockFrame>
  );
}

function CalendarEventRow({
  color,
  day,
  title,
  time,
  fromTrip,
}: {
  color: string;
  day: string;
  title: string;
  time: string;
  fromTrip?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-xs dark:border-slate-800/70 dark:bg-slate-900/60">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-800 dark:text-slate-100">
          {title}
        </p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
          {day} · {time}
          {fromTrip && (
            <span className="ml-1 rounded-sm bg-sky-50 px-1 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              {t("landing.tour.calendar.fromTrip")}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function MockShopping() {
  const { t } = useTranslation();
  const items: { name: string; qty: string; done: boolean; by?: string }[] = [
    { name: t("landing.tour.shopping.i1"), qty: "1 l", done: true, by: "Anna" },
    { name: t("landing.tour.shopping.i2"), qty: "", done: true, by: "Tom" },
    { name: t("landing.tour.shopping.i3"), qty: "500 g", done: false },
    { name: t("landing.tour.shopping.i4"), qty: "2 kg", done: false },
    { name: t("landing.tour.shopping.i5"), qty: "3×", done: false },
  ];
  return (
    <MockFrame title="friendflow / einkauf">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{t("landing.tour.shopping.openCount", { count: 3 })}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-amber-500 motion-safe:animate-ping-ring" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse-dot" />
          </span>
          {t("landing.tour.shopping.live")}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800/70">
        {items.map((it) => (
          <li
            key={it.name}
            className="flex items-center gap-3 bg-white/80 px-3 py-2 text-xs dark:bg-slate-900/60"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                it.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 text-transparent dark:border-slate-600"
              }`}
            >
              <Check className="h-3 w-3" />
            </span>
            <span
              className={`flex-1 truncate ${
                it.done
                  ? "text-slate-400 line-through dark:text-slate-500"
                  : "font-medium text-slate-800 dark:text-slate-100"
              }`}
            >
              {it.name}
            </span>
            {it.qty && (
              <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                {it.qty}
              </span>
            )}
            {it.by ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                {it.by}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {t("landing.tour.shopping.open")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockTasks() {
  const { t } = useTranslation();
  type Priority = "high" | "normal" | "low";
  type Due = "today" | "tomorrow" | "week" | "done";
  const tasks: {
    title: string;
    assignee: string;
    priority: Priority;
    due: Due;
    done: boolean;
  }[] = [
    {
      title: t("landing.tour.tasks.t1"),
      assignee: "Anna",
      priority: "high",
      due: "today",
      done: false,
    },
    {
      title: t("landing.tour.tasks.t2"),
      assignee: "Ben",
      priority: "normal",
      due: "tomorrow",
      done: false,
    },
    {
      title: t("landing.tour.tasks.t3"),
      assignee: t("landing.tour.you"),
      priority: "low",
      due: "week",
      done: false,
    },
    {
      title: t("landing.tour.tasks.t4"),
      assignee: "Tom",
      priority: "normal",
      due: "done",
      done: true,
    },
  ];
  return (
    <MockFrame title="friendflow / wg-aufgaben">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800/70">
        {tasks.map((tk) => (
          <li
            key={tk.title}
            className="flex items-start gap-3 bg-white/80 px-3 py-2.5 text-xs dark:bg-slate-900/60"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                tk.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 text-transparent dark:border-slate-600"
              }`}
            >
              <Check className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`font-medium ${
                    tk.done
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {tk.title}
                </span>
                {!tk.done && tk.priority === "high" && (
                  <TaskChip tone="rose">
                    {t("landing.tour.tasks.priHigh")}
                  </TaskChip>
                )}
                {!tk.done && tk.priority === "low" && (
                  <TaskChip tone="slate">
                    {t("landing.tour.tasks.priLow")}
                  </TaskChip>
                )}
                {!tk.done && tk.due === "today" && (
                  <TaskChip tone="amber">
                    {t("landing.tour.tasks.dueToday")}
                  </TaskChip>
                )}
                {!tk.done && tk.due === "tomorrow" && (
                  <TaskChip tone="amber">
                    {t("landing.tour.tasks.dueTomorrow")}
                  </TaskChip>
                )}
                {!tk.done && tk.due === "week" && (
                  <TaskChip tone="sky">
                    {t("landing.tour.tasks.dueWeek")}
                  </TaskChip>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {tk.done
                  ? t("landing.tour.tasks.doneBy", { name: tk.assignee })
                  : t("landing.tour.tasks.assigned", { name: tk.assignee })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

type ChipTone = "rose" | "amber" | "sky" | "slate";

function TaskChip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: React.ReactNode;
}) {
  const styles: Record<ChipTone, string> = {
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    slate:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/** Section heading with cascading reveals on each line. */
function RevealHeading({
  eyebrow,
  title,
  subtitle,
  centered,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Reveal direction="up" durationMs={500}>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          {eyebrow}
        </p>
      </Reveal>
      <Reveal direction="up" delayMs={80} durationMs={600}>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
      </Reveal>
      <Reveal direction="up" delayMs={160} durationMs={600}>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
          {subtitle}
        </p>
      </Reveal>
    </div>
  );
}
