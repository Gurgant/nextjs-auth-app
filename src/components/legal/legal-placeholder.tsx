import Link from "next/link";
import { FormPageLayout } from "@/components/layouts";

interface LegalPlaceholderProps {
  /** The locale of the page: its link stays under it. */
  locale: string;
  /** The name of the document, as the registration form's link reads. */
  title: string;
  noticeTitle: string;
  notice: string;
  outlineHeading: string;
  outline: string[];
  stillOpenInOtherTab: string;
  goToRegistration: string;
}

/**
 * The body of /{locale}/terms and /{locale}/privacy, the two pages that the
 * terms sentence of the registration form links to. The starter kit has no
 * legal text of its own, and nothing here is one: the page says that it holds
 * placeholder text that whoever operates the application has to replace, and
 * lists what such a document usually covers. Each page reads its texts and
 * hands them over.
 *
 * The form opens the page in a new tab, so the filled form is still in the
 * first one, and the page says so. Its one link is for a visitor who opened
 * the page directly: it leads to the registration page and is not called a
 * way back, because the form it leads to is empty.
 *
 * The name of a document can be one long word (German). The heading is a
 * gradient clipped to its text, so a word wider than the heading would be cut
 * off without a trace: it is smaller on a narrow screen and may break.
 */
export function LegalPlaceholder({
  locale,
  title,
  noticeTitle,
  notice,
  outlineHeading,
  outline,
  stillOpenInOtherTab,
  goToRegistration,
}: LegalPlaceholderProps) {
  return (
    <FormPageLayout maxWidth="lg">
      <article className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6 break-words hyphens-auto">
          {title}
        </h1>

        <div
          role="note"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-8"
        >
          <p className="font-semibold text-amber-900">{noticeTitle}</p>
          <p className="mt-1 text-sm text-amber-900">{notice}</p>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          {outlineHeading}
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-600">
          {outline.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <div className="mt-8 pt-6 border-t border-gray-200 space-y-3">
          <p className="text-sm text-gray-600">{stillOpenInOtherTab}</p>
          <Link
            href={`/${locale}/register`}
            className="inline-block font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200"
          >
            {goToRegistration}
          </Link>
        </div>
      </article>
    </FormPageLayout>
  );
}
