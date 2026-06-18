"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import {
  addAllowedUser,
  removeAllowedUser,
  setAllowedRole,
} from "./actions";

type Row = {
  id: string;
  email: string;
  role: string;
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

export function AdminUsersTable({
  rows,
  meEmail,
}: {
  rows: Row[];
  meEmail: string | null;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);

  const [adding, startAdd] = useTransition();
  // Per-row pending state, keyed by row id, so a spinner only shows on the
  // row being mutated.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRowAction] = useTransition();

  const meLower = meEmail?.trim().toLowerCase() ?? null;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startAdd(async () => {
      const res = await addAllowedUser(email, role);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail("");
      setRole("user");
      router.refresh();
    });
  }

  function handleSetRole(id: string, nextRole: "user" | "admin") {
    setError(null);
    setBusyId(id);
    startRowAction(async () => {
      const res = await setAllowedRole(id, nextRole);
      if (!res.ok) setError(res.error);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    setError(null);
    setBusyId(id);
    startRowAction(async () => {
      const res = await removeAllowedUser(id);
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
          placeholder="person@example.com"
          className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          autoComplete="off"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "user" | "admin")}
          className="h-10 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Role for the new user"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <Button type="submit" disabled={adding} className="shrink-0">
          {adding ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          Add user
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No allowlisted users yet"
          body="Add an email above to let someone sign in. Bootstrap admins from ADMIN_EMAILS can always sign in regardless of this list."
        />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => {
            const isMe = meLower !== null && row.email.toLowerCase() === meLower;
            const busy = busyId === row.id;
            const rowRole: "user" | "admin" =
              row.role === "admin" ? "admin" : "user";
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.email}
                    </span>
                    <Badge tone={rowRole === "admin" ? "brand" : "neutral"}>
                      {rowRole}
                    </Badge>
                    {isMe ? <Badge tone="info">you</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {row.addedBy ? `Added by ${row.addedBy} · ` : ""}
                    {formatDate(row.createdAt)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={rowRole}
                    onChange={(e) =>
                      handleSetRole(
                        row.id,
                        e.target.value as "user" | "admin",
                      )
                    }
                    disabled={busy}
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Role for ${row.email}`}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>

                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || isMe}
                    onClick={() => handleRemove(row.id)}
                    title={isMe ? "You can't remove yourself" : "Remove user"}
                  >
                    {busy ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
