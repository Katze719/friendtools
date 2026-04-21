import { useEffect, useRef, useState } from "react";

type UseInViewOptions = {
  /** IntersectionObserver threshold (0..1). */
  threshold?: number;
  /** IntersectionObserver rootMargin. */
  rootMargin?: string;
  /** If true, stop observing after the first reveal. */
  once?: boolean;
};

/**
 * Minimal wrapper around IntersectionObserver that returns a ref to attach to
 * the observed element and a boolean that flips to `true` once it enters the
 * viewport. Falls back to `true` when IntersectionObserver is unavailable
 * (e.g. SSR / very old browsers) so content never gets stuck hidden.
 */
export function useInView<T extends Element = HTMLElement>({
  threshold = 0.15,
  rootMargin = "0px 0px -10% 0px",
  once = true,
}: UseInViewOptions = {}): [React.MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}

type RevealProps = {
  /** How the element should enter. Defaults to a gentle rise. */
  direction?: "up" | "left" | "right" | "fade";
  /** Additional delay (ms) before the transition fires. Great for stagger. */
  delayMs?: number;
  /** Transition duration (ms). */
  durationMs?: number;
  /** Extra classes applied to the wrapper. */
  className?: string;
  /** IntersectionObserver threshold override. */
  threshold?: number;
  /** Re-run the animation every time it enters the viewport. */
  once?: boolean;
  children: React.ReactNode;
};

/**
 * Wraps children in a `<div>` that animates from an offset/transparent state
 * into place once it scrolls into view. Respects `prefers-reduced-motion` via
 * the `motion-reduce:` Tailwind variants (it falls back to an instant reveal).
 */
export function Reveal({
  direction = "up",
  delayMs = 0,
  durationMs = 600,
  className = "",
  threshold,
  once = true,
  children,
}: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold, once });
  // Only promote to its own layer while the enter animation is actually
  // pending / running. Keeping `will-change: transform` on every Reveal for
  // the lifetime of the page explodes the compositor layer tree (see MDN:
  // "Do not apply will-change to too many elements" / "remove it when it's
  // no longer needed"). We drop the hint shortly after the reveal fires.
  const [animating, setAnimating] = useState(!inView);

  useEffect(() => {
    if (!inView) {
      setAnimating(true);
      return;
    }
    const totalMs = durationMs + delayMs + 50;
    const handle = window.setTimeout(() => setAnimating(false), totalMs);
    return () => window.clearTimeout(handle);
  }, [inView, durationMs, delayMs]);

  const hiddenTransform =
    direction === "left"
      ? "-translate-x-4"
      : direction === "right"
        ? "translate-x-4"
        : direction === "fade"
          ? ""
          : "translate-y-4";

  const base =
    "transition-all ease-out " +
    "motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100";
  const state = inView
    ? "opacity-100 translate-x-0 translate-y-0"
    : `opacity-0 ${hiddenTransform}`;

  return (
    <div
      ref={ref}
      className={`${base} ${state} ${className}`}
      style={{
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
        willChange: animating ? "transform, opacity" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export default Reveal;
