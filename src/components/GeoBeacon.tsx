"use client";

import { useEffect } from "react";
import { reportGeo } from "@/app/(app)/geo-actions";

/**
 * Fire-and-forget: report the browser's timezone + locale once on mount so the
 * admin geo stats can aggregate users by country. Renders nothing; failures are
 * swallowed (geo is best-effort, never blocks the page).
 */
export function GeoBeacon() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.language;
    void reportGeo({ timezone, locale }).catch(() => {});
  }, []);

  return null;
}
