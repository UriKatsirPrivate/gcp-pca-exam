// Sign-in is open to any Google account whose email is on an allowed domain
// (default: google.com). Override with ALLOWED_EMAIL_DOMAINS (comma/space
// separated). Pure and dependency-free so it can be unit-tested and used from
// both the Node and edge runtimes.

/** Exact domain match only: no subdomains, and "x@google.com.evil.com" or "x@notgoogle.com" never match. */
export function allowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS?.trim() || "google.com";
  return raw
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAllowedEmailDomain(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at !== e.indexOf("@")) return false; // exactly one "@"
  return allowedEmailDomains().includes(e.slice(at + 1));
}
