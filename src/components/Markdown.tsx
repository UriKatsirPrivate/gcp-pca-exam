import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/**
 * Renders authored markdown (module bodies, explanations) with GFM tables/lists.
 * Block elements are DIRECT children of this div — TTS highlighting
 * (AudioPlayer) indexes them by position, matching the blockIndex emitted by
 * src/lib/tts/speakable.ts from the same parser.
 */
export function Markdown({
  children,
  className,
  id,
}: {
  children: string;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn("prose-content", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
