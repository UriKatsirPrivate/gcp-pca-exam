import { getCountryForTimezone } from "countries-and-timezones";

// Browser-reported geo → ISO-3166 alpha-2 country code. The timezone is the
// primary signal (OS-set, location-derived); the locale region is a fallback
// for the rare timezone we can't map. Approximate by design (VPN, manual OS
// settings) — good enough for a cumulative admin view, never per-user truth.

/** Pull the region subtag from a BCP-47 locale, e.g. "en-US" → "US". */
function regionFromLocale(locale?: string | null): string | null {
  if (!locale) return null;
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch {
    return null;
  }
}

/** ISO alpha-2 country from a browser timezone, falling back to the locale. */
export function countryFromBrowser(
  timezone?: string | null,
  locale?: string | null,
): string | null {
  if (timezone) {
    const c = getCountryForTimezone(timezone);
    if (c?.id) return c.id;
  }
  return regionFromLocale(locale);
}

/** Human-readable country name for an ISO alpha-2 code (built-in Intl data). */
export function countryName(iso: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso
    );
  } catch {
    return iso;
  }
}

/** Flag emoji from an ISO alpha-2 code via regional-indicator codepoints. */
export function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "🏳️";
  const base = 0x1f1e6; // regional indicator "A"
  const cc = iso.toUpperCase();
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}
