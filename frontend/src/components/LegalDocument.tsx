import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

/**
 * Renders a Markdown legal document with readable typography for light/dark mode.
 */
export default function LegalDocument({
  markdown,
  backTo,
  backLabel,
}: {
  markdown: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto min-h-full max-w-3xl px-safe py-10">
      <Link
        to={backTo}
        className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        {backLabel}
      </Link>
      <article
        className="mt-6 space-y-6 text-slate-700 dark:text-slate-300 [&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-400 [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-slate-900 [&_h1]:first:mt-0 dark:[&_h1]:text-slate-100 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_hr]:my-8 [&_hr]:border-slate-200 dark:[&_hr]:border-slate-700 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-6"
      >
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
