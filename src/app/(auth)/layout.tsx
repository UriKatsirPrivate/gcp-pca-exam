import Link from "next/link";
import { Cloud } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Cloud className="text-brand-600" size={28} />
          <span className="text-xl font-semibold">PCA Prep</span>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
