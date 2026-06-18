"use client";

import { useEffect, useRef } from "react";
import { markProgress } from "../../actions";

/**
 * Flips a module from "todo" to "in-progress" on first view. Runs in an effect
 * (not during render) so the server action's revalidatePath is legal.
 */
export function MarkProgressOnView({
  moduleId,
  initialStatus,
}: {
  moduleId: string;
  initialStatus: string;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    if (initialStatus === "todo") {
      fired.current = true;
      void markProgress(moduleId, "in-progress");
    }
  }, [moduleId, initialStatus]);
  return null;
}
