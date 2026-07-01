"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Trash2, UserPlus, X } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const [adding, startAdd] = useTransition();
  // Per-row pending state, keyed by row id, so a spinner only shows on the
  // row being mutated.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRowAction] = useTransition();

  // Two-step delete: the trash icon arms a "Confirm" button for that row.
  // Auto-disarms after a few seconds so a stray click can't linger.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meLower = meEmail?.trim().toLowerCase() ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(q));
  }, [rows, query]);

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
    disarmConfirm();
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
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search email…"
                className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Search users by email"
              />
            </div>
            <span className="shrink-0 text-xs text-muted" aria-live="polite">
              {query.trim()
                ? `${filtered.length} of ${rows.length}`
                : `${rows.length} ${rows.length === 1 ? "user" : "users"}`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-line px-4 py-6 text-center text-sm text-muted">
              No users match “{query.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {filtered.map((row) => {
                const isMe =
                  meLower !== null && row.email.toLowerCase() === meLower;
                const busy = busyId === row.id;
                const confirming = confirmId === row.id;
                const rowRole: "user" | "admin" =
                  row.role === "admin" ? "admin" : "user";
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {row.email}
                      </span>
                      <Badge tone={rowRole === "admin" ? "brand" : "neutral"}>
                        {rowRole}
                      </Badge>
                      {isMe ? <Badge tone="info">you</Badge> : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="hidden text-xs text-muted sm:inline"
                        title={
                          row.addedBy ? `Added by ${row.addedBy}` : undefined
                        }
                      >
                        {formatDate(row.createdAt)}
                      </span>
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
                          title={
                            isMe ? "You can't remove yourself" : "Remove user"
                          }
                          aria-label={`Remove ${row.email}`}
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
        </>
      )}
    </div>
  );
}
