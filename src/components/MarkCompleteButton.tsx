"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { markProgress } from "@/app/(app)/learn/actions";

/**
 * Explicit "mark module complete / incomplete" toggle. Complements the quiz,
 * which also auto-marks "done" on finish. Optimistically flips local state and
 * refreshes so the surrounding server-rendered progress UI stays in sync.
 */
export function MarkCompleteButton({
  moduleId,
  initialStatus,
}: {
  moduleId: string;
  initialStatus: string;
}) {
  const [done, setDone] = useState(initialStatus === "done");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function complete() {
    startTransition(async () => {
      await markProgress(moduleId, "done");
      setDone(true);
      router.refresh();
    });
  }

  function reopen() {
    startTransition(async () => {
      await markProgress(moduleId, "todo");
      setDone(false);
      router.refresh();
    });
  }

  if (done) {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={reopen}
      >
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <CheckCircle2 size={16} className="text-success" />
        )}
        Completed — mark incomplete
      </Button>
    );
  }

  return (
    <Button variant="success" size="sm" disabled={pending} onClick={complete}>
      {pending ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <CheckCircle2 size={16} />
      )}
      Mark as complete
    </Button>
  );
}
