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
 * Lets an admin force-unlock (or relock) the final exam for each listed
 * account — keyed by email, so it also works (via the form) for people who haven't
 * signed in yet. "Unlocked" is the admin override; a user can still have the exam unlocked
 * by meeting the progress criteria even when this is off.
 */
export function ExamAccessTable({ users }: { users: ExamUser[] }) {
  const router = useRouter();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggle(target: string, next: boolean) {
    setError(null);
    setPendingEmail(target);
    startTransition(async () => {
      const res = await setExamUnlocked(target, next);
      if (!res.ok) setError(res.error);
      else setEmail("");
      setPendingEmail(null);
      router.refresh();
    });
  }

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toggle(email, true);
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="person@google.com — unlock before their first sign-in"
        className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        autoComplete="off"
        aria-label="Email to unlock the exam for"
      />
      <Button
        type="submit"
        disabled={pendingEmail !== null}
        className="shrink-0"
      >
        <Unlock size={15} />
        Unlock exam
      </Button>
    </form>
  );

  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {form}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <EmptyState
          title="No users yet"
          body="People appear here after their first sign-in. You can also unlock the exam for an email above."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {form}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
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
    </div>
  );
}
