import type { Video } from "@/lib/content/schema";

export function VideoList({ videos }: { videos: Video[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {videos.map((v) => (
        <div
          key={v.youtubeId}
          className="overflow-hidden rounded-xl border border-line bg-surface"
        >
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`}
              title={v.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="p-3">
            <div className="text-sm font-medium leading-snug">{v.title}</div>
            {v.channel ? (
              <div className="mt-0.5 text-xs text-muted">{v.channel}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
