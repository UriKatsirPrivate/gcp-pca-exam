"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { resetProgress } from "@/app/(app)/dashboard/actions";

/**
 * Destructive "reset all progress" control. Two-step: a reset button reveals an
 * explicit confirm so it can't be triggered by a single misclick. The server
 * action revalidates the affected routes; we also refresh to repaint the page.
 */
export function DangerZone() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      await resetProgress();
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <Card className="border-danger/40">
      <CardHeader
        title="Danger zone"
        subtitle="Irreversible actions for this account."
        icon={<AlertTriangle className="h-5 w-5 text-danger" />}
      />
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-medium">Reset all progress</h4>
          <p className="mt-0.5 text-sm text-muted">
            Permanently deletes your assessments, quiz attempts, study plans,
            module progress, and exam runs. Your account and sign-in stay intact.
          </p>
        </div>

        {confirming ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReset} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Yes, delete everything
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            className="shrink-0"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
            Reset progress
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
