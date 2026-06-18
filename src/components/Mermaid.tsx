"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Client-only Mermaid renderer. Dynamically imports mermaid so it never lands in
 * the server bundle, and re-renders when the chart or color scheme changes.
 */
export function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark =
          typeof document !== "undefined" &&
          document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        const { svg: out, bindFunctions } = await mermaid.render(id, chart);
        if (cancelled) return;
        setSvg(out);
        setError(null);
        // bindFunctions attaches interactivity after the SVG is in the DOM.
        queueMicrotask(() => {
          if (ref.current && bindFunctions) bindFunctions(ref.current);
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className={`mermaid-host flex justify-center overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
