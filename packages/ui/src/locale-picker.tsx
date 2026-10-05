// Choose the app's language: one button per locale, each named in its OWN language, so someone
// stuck in a language they cannot read still finds theirs. Takes what `useLocale()` from
// @frediverse/i18n/react returns, so it does not depend on that package itself.

import { Button } from "./button";
import { cn } from "./lib/utils";

// "Français" for fr, read in French — falls back to the code where the runtime does not know it.
const nativeName = (locale: string) => {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(
      locale,
    );
    return name
      ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
      : locale;
  } catch {
    return locale.toUpperCase();
  }
};

export function LocalePicker<L extends string>({
  locale,
  locales,
  setLocale,
  className,
}: {
  locale: L;
  locales: readonly L[];
  setLocale: (locale: L) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {locales.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          lang={option}
          variant={option === locale ? "default" : "outline"}
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
        >
          {nativeName(option)}
        </Button>
      ))}
    </div>
  );
}
