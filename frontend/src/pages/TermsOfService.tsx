import { useTranslation } from "react-i18next";
import LegalDocument from "../components/LegalDocument";
import termsMarkdown from "../../../legal/TERMS_OF_SERVICE.md?raw";

export default function TermsOfService() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      markdown={termsMarkdown}
      backTo="/"
      backLabel={t("legal.backHome")}
    />
  );
}
