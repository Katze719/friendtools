import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemePreference } from "../context/ThemeContext";

const OPTIONS: { value: ThemePreference; icon: typeof Sun; labelKey: string }[] = [
  { value: "light", icon: Sun, labelKey: "theme.light" },
  { value: "dark", icon: Moon, labelKey: "theme.dark" },
  { value: "system", icon: Monitor, labelKey: "theme.system" },
];

export default function ThemeSwitcher() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label={t("theme.aria")}
    >
      <div className="segmented">
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              aria-pressed={active}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              className={`segmented-item-compact ${
                active ? "segmented-item-active" : "segmented-item-idle"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
