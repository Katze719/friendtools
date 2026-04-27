import { useTranslation } from "react-i18next";
import LegalDocument from "../components/LegalDocument";
import privacyMarkdown from "../../legal/PRIVACY_POLICY.md?raw";

export default function PrivacyPolicy() {
  const { t } = useTranslation();
  return (
    <LegalDocument
      markdown={privacyMarkdown}
      backTo="/"
      backLabel={t("legal.backHome")}
    />
  );
}
