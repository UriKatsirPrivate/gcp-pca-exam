"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { countryFromBrowser } from "@/lib/geo";

/**
 * Record the signed-in user's browser-reported geo for cumulative admin stats.
 * Called once per page load by <GeoBeacon>, but writes only when the derived
 * country/timezone actually changed (updateMany with a difference guard), so a
 * returning user costs a single read, no write.
 */
export async function reportGeo(input: {
  timezone?: string | null;
  locale?: string | null;
}): Promise<void> {
  const me = await requireUser();

  const timezone = input.timezone?.trim() || null;
  const country = countryFromBrowser(timezone, input.locale);
  // Nothing usable (no mappable tz, no locale region) — don't clobber a value
  // we may already have with null.
  if (!country) return;

  // `not` filters skip NULL rows in SQL, so spell out the null cases too —
  // otherwise a brand-new user (country IS NULL) would never get written.
  await prisma.user.updateMany({
    where: {
      id: me.id,
      OR: [
        { country: null },
        { country: { not: country } },
        { timezone: null },
        { timezone: { not: timezone } },
      ],
    },
    data: { country, timezone },
  });
}
