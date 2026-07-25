// Locale is derived from the URL path in exactly one place. Dutch content
// lives under /nl; everything else is English.
//
// This is the seam a full i18n library would replace later. Keep the
// derivation here rather than checking the path inline anywhere else.

export const LOCALES = ["en", "nl"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function localeFromPath(pathname: string): Locale {
  return pathname === "/nl" || pathname.startsWith("/nl/") ? "nl" : "en";
}

/** BCP 47 tag for the html lang attribute and hreflang. */
export const HTML_LANG: Record<Locale, string> = {
  en: "en",
  nl: "nl",
};
