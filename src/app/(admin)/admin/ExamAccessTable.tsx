"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Unlock } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { setExamUnlocked } from "./actions";

export type ExamUser = {
  email: string;
  name: string | null;
  examUnlocked: boolean;
  signedIn: boolean;
};

/**
 * Lets an admin force-unlock (or relock) the final exam for each allowlisted
 * account — keyed by email, so it also works for people who haven't signed in
 * yet. "Unlocked" is the admin override; a user can still have the exam unlocked
 * by meeting the progress criteria even when this is off.
 */
export function ExamAccessTable({ users }: { users: ExamUser[] }) {
  const router = useRouter();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(email: string, next: boolean) {
    setPendingEmail(email);
    startTransition(async () => {
      await setExamUnlocked(email, next);
      setPendingEmail(null);
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <EmptyState
        title="No users to unlock"
        body="Allowlist an email above (or set ADMIN_EMAILS) and it'll appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {users.map((u) => {
        const pending = pendingEmail === u.email;
        return (
          <li
            key={u.email}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {u.name ?? u.email}
              </div>
              <div className="truncate text-xs text-muted">
                {u.name ? u.email : null}
                {!u.signedIn ? (
                  <span className={u.name ? "ml-1" : ""}>
                    {u.name ? "· " : ""}not signed in yet
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {u.examUnlocked ? (
                <Badge tone="success">Exam unlocked</Badge>
              ) : (
                <Badge tone="neutral">Default</Badge>
              )}
              <Button
                size="sm"
                variant={u.examUnlocked ? "secondary" : "primary"}
                disabled={pending}
                onClick={() => toggle(u.email, !u.examUnlocked)}
              >
                {pending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : u.examUnlocked ? (
                  <Lock size={15} />
                ) : (
                  <Unlock size={15} />
                )}
                {u.examUnlocked ? "Relock" : "Unlock exam"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
