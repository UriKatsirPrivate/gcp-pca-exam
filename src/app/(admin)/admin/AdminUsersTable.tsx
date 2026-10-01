"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { addAdmin, removeAdmin } from "./actions";

type Row = {
  id: string;
  email: string;
  addedBy: string | null;
  createdAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Admin grants stored in the AllowedUser table (ADMIN_EMAILS are listed separately). */
export function AdminUsersTable({
  rows,
  meEmail,
}: {
  rows: Row[];
  meEmail: string | null;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRowAction] = useTransition();

  // Two-step removal: the trash icon arms a "Confirm" button for that row.
  // Auto-disarms after a few seconds so a stray click can't linger.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meLower = meEmail?.trim().toLowerCase() ?? null;

  function armConfirm(id: string) {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmId(id);
    confirmTimer.current = setTimeout(() => setConfirmId(null), 4000);
  }

  function disarmConfirm() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmId(null);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startAdd(async () => {
      const res = await addAdmin(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail("");
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    setError(null);
    disarmConfirm();
    setBusyId(id);
    startRowAction(async () => {
      const res = await removeAdmin(id);
      if (!res.ok) setError(res.error);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@google.com"
          className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          autoComplete="off"
          aria-label="Email to make an admin"
        />
        <Button type="submit" disabled={adding} className="shrink-0">
          {adding ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          Make admin
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No admins added here yet"
          body="Add an email above to grant the admin role. Bootstrap admins from ADMIN_EMAILS are always admins regardless of this list."
        />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => {
            const isMe = meLower !== null && row.email.toLowerCase() === meLower;
            const busy = busyId === row.id;
            const confirming = confirmId === row.id;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{row.email}</span>
                  <Badge tone="brand">admin</Badge>
                  {isMe ? <Badge tone="info">you</Badge> : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="hidden text-xs text-muted sm:inline"
                    title={row.addedBy ? `Added by ${row.addedBy}` : undefined}
                  >
                    {formatDate(row.createdAt)}
                  </span>

                  {busy ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center text-muted">
                      <Loader2 size={16} className="animate-spin" />
                    </span>
                  ) : confirming ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemove(row.id)}
                        autoFocus
                      >
                        Confirm
                      </Button>
                      <button
                        type="button"
                        onClick={disarmConfirm}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label="Cancel removal"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => armConfirm(row.id)}
                      disabled={isMe}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
                      title={isMe ? "You can't remove yourself" : "Revoke admin"}
                      aria-label={`Revoke admin for ${row.email}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
