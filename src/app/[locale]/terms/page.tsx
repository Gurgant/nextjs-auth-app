import { getTranslations } from "next-intl/server";
import { LegalPlaceholder } from "@/components/legal/legal-placeholder";

interface Props {
  params: Promise<{ locale: string }>;
}

// A placeholder page of the starter kit, open to everyone: the terms sentence
// of the registration form links here. Whoever operates the application
// replaces it with their own terms before going live (README, "Scope and
// limits"); the texts are the Legal.* keys of messages/.
export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Legal");

  return (
    <LegalPlaceholder
      locale={locale}
      title={t("terms.title")}
      noticeTitle={t("placeholderTitle")}
      notice={t("placeholderNotice")}
      outlineHeading={t("outlineHeading")}
      outline={[
        t("terms.outline.provider"),
        t("terms.outline.accounts"),
        t("terms.outline.use"),
        t("terms.outline.liability"),
      ]}
      stillOpenInOtherTab={t("stillOpenInOtherTab")}
      goToRegistration={t("goToRegistration")}
    />
  );
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  const tLayout = await getTranslations({ locale, namespace: "Layout" });

  return {
    // As the verification page: the name of the page, then the application's.
    title: `${t("terms.title")} - ${tLayout("appTitle")}`,
    description: t("placeholderNotice"),
  };
}
