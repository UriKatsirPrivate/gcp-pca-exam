"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import { ArrowDownToLine, Headphones, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AudioSegment } from "@/lib/content/schema";

const RATES = [1, 1.25, 1.5, 2] as const;
const RATE_KEY = "pca:audio-rate";
const AUTOSCROLL_KEY = "pca:audio-autoscroll";
const SAVE_INTERVAL_MS = 5000;
// Don't resume within 10s of the start (barely started) or end (finished).
const RESUME_EDGE_SEC = 10;
// AppNav is sticky h-14 (56px); the player card sticks right below it.
const NAV_OFFSET_PX = 56;
// Auto-scroll keeps the estimated narration point at this fraction of the
// viewport height, and never moves faster than MAX_SCROLL_STEP_PX per frame.
const READ_ANCHOR = 0.35;
const MAX_SCROLL_STEP_PX = 40;
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence only (e.g. private browsing).
  }
}

// localStorage never notifies same-tab writes; in-session changes flow
// through component state, so an inert subscription is sufficient.
function subscribeNoop() {
  return () => {};
}

function readStoredRate(): number | null {
  const stored = Number(readStorage(RATE_KEY));
  return (RATES as readonly number[]).includes(stored) ? stored : null;
}

function readStoredAutoScroll(): boolean | null {
  const stored = readStorage(AUTOSCROLL_KEY);
  if (stored === "on") return true;
  if (stored === "off") return false;
  return null;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Narrated-module player. Deliberately does NOT touch module progress —
 * listening is passive; only reading/quizzing marks progress.
 *
 * Renders its own card chrome so it can stick below the app nav while the
 * user scrolls, and (when `bodyId` is set) auto-scrolls the page to track
 * narration progress, mapped proportionally onto that element's height.
 */
/** Index of the segment whose narration covers `timeSec`, or -1. */
function activeSegmentIndex(
  segments: AudioSegment[] | undefined,
  timeSec: number,
): number {
  if (!segments?.length) return -1;
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startSec <= timeSec) idx = i;
    else break;
  }
  return idx;
}

export function AudioPlayer({
  src,
  moduleId,
  estDurationSec,
  bodyId,
  segments,
}: {
  src: string;
  moduleId: string;
  estDurationSec?: number;
  bodyId?: string;
  segments?: AudioSegment[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastSaveRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [stuck, setStuck] = useState(false);
  // Persisted prefs are read via useSyncExternalStore (server snapshot: null)
  // so hydration matches the server-rendered HTML without a setState-in-effect.
  const storedRate = useSyncExternalStore(
    subscribeNoop,
    readStoredRate,
    getServerSnapshot,
  );
  const [rateOverride, setRateOverride] = useState<number | null>(null);
  const rate = rateOverride ?? storedRate ?? 1;
  const storedAutoScroll = useSyncExternalStore(
    subscribeNoop,
    readStoredAutoScroll,
    getServerSnapshot,
  );
  const [autoScrollOverride, setAutoScrollOverride] = useState<boolean | null>(
    null,
  );
  const autoScroll = autoScrollOverride ?? storedAutoScroll ?? true;
  const [errored, setErrored] = useState(false);

  const posKey = `pca:audio-pos:${moduleId}`;

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Shadow the card once it's actually pinned (sentinel scrolled under the nav).
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: `-${NAV_OFFSET_PX + 1}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Highlight the block being narrated. Runs off the ~4 Hz currentTime state
  // (block granularity doesn't need frame precision). The title segment has
  // blockIndex null — nothing highlights until body narration starts.
  const activeSegIdx = useMemo(
    () => activeSegmentIndex(segments, currentTime),
    [segments, currentTime],
  );
  useEffect(() => {
    if (!bodyId || errored) return;
    const blockIndex =
      activeSegIdx >= 0 ? segments![activeSegIdx].blockIndex : null;
    if (blockIndex === null) return;
    const block = document.getElementById(bodyId)?.children[blockIndex];
    if (!block) return;
    block.classList.add("tts-active");
    return () => block.classList.remove("tts-active");
  }, [activeSegIdx, segments, bodyId, errored]);

  // Follow the narration: while playing, ease window scroll toward the point
  // being read. With segment timings the target anchors to the active block
  // (interpolating within it); otherwise it falls back to mapping overall
  // progress onto the body height. Any manual scroll input switches
  // auto-scroll off (visibly); the toggle button re-enables it.
  useEffect(() => {
    if (!playing || !autoScroll || !bodyId) return;

    let raf = 0;
    // Last position this loop itself scrolled to; a scroll event that lands
    // anywhere else came from the user (covers scrollbar drags, which emit
    // no wheel/touch/key events).
    let expectedY = window.scrollY;
    const step = () => {
      const el = audioRef.current;
      const body = document.getElementById(bodyId);
      if (el && body && Number.isFinite(el.duration) && el.duration > 0) {
        const anchor = window.innerHeight * READ_ANCHOR;
        let target: number | null = null;
        const idx = activeSegmentIndex(segments, el.currentTime);
        if (idx >= 0) {
          const { blockIndex, startSec } = segments![idx];
          if (blockIndex === null) {
            target = 0; // narrating the title — stay at the top
          } else if (blockIndex < body.children.length) {
            const block = body.children[blockIndex] as HTMLElement;
            const top = block.getBoundingClientRect().top + window.scrollY;
            const end =
              idx + 1 < segments!.length
                ? segments![idx + 1].startSec
                : el.duration;
            const frac =
              end > startSec
                ? Math.min(
                    1,
                    Math.max(0, (el.currentTime - startSec) / (end - startSec)),
                  )
                : 0;
            target = top + frac * block.offsetHeight - anchor;
          }
        }
        if (target === null) {
          const bodyTop = body.getBoundingClientRect().top + window.scrollY;
          target =
            bodyTop + (el.currentTime / el.duration) * body.offsetHeight - anchor;
        }
        target = Math.max(0, target);
        const delta = target - window.scrollY;
        if (Math.abs(delta) > 1) {
          const move =
            Math.sign(delta) *
            Math.min(
              Math.max(Math.abs(delta) * 0.08, 0.5),
              MAX_SCROLL_STEP_PX,
            );
          // Explicit "instant": html has scroll-behavior:smooth, which would
          // animate each step async and make expectedY (and the user-scroll
          // detection below) read stale positions. The loop does its own easing.
          window.scrollTo({ top: window.scrollY + move, behavior: "instant" });
        }
      }
      expectedY = window.scrollY;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const disengage = () => setAutoScrollOverride(false);
    const onScroll = () => {
      if (Math.abs(window.scrollY - expectedY) > 4) disengage();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (SCROLL_KEYS.has(e.key)) disengage();
    };
    window.addEventListener("wheel", disengage, { passive: true });
    window.addEventListener("touchmove", disengage, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", disengage);
      window.removeEventListener("touchmove", disengage);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [playing, autoScroll, bodyId, segments]);

  function savePosition(time: number) {
    writeStorage(posKey, String(time));
    lastSaveRef.current = Date.now();
  }

  function onLoadedMetadata() {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
    setDuration(el.duration);
    const saved = Number(readStorage(posKey));
    if (
      Number.isFinite(saved) &&
      saved >= RESUME_EDGE_SEC &&
      saved <= el.duration - RESUME_EDGE_SEC
    ) {
      el.currentTime = saved;
      setCurrentTime(saved);
    }
  }

  // The SSR'd <audio preload="metadata"> can finish loading (e.g. from disk
  // cache) before hydration attaches the non-bubbling loadedmetadata handler.
  // If the event already fired, run the same restore logic on mount so the
  // slider enables and the saved position survives.
  useEffect(() => {
    const el = audioRef.current;
    if (el && el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoadedMetadata();
    }
    // Mount-only recovery for a pre-hydration loadedmetadata event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (Date.now() - lastSaveRef.current >= SAVE_INTERVAL_MS) {
      savePosition(el.currentTime);
    }
  }

  function onPause() {
    setPlaying(false);
    const el = audioRef.current;
    if (el) savePosition(el.currentTime);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  function onSeek(e: ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (el) el.currentTime = t;
  }

  function cycleRate() {
    const idx = (RATES as readonly number[]).indexOf(rate);
    const next = RATES[(idx + 1) % RATES.length];
    setRateOverride(next);
    writeStorage(RATE_KEY, String(next));
  }

  function toggleAutoScroll() {
    const next = !autoScroll;
    setAutoScrollOverride(next);
    writeStorage(AUTOSCROLL_KEY, next ? "on" : "off");
  }

  const total = duration ?? estDurationSec ?? null;

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <section
        className={cn(
          "sticky top-14 z-20 mb-8 rounded-xl border border-line bg-surface p-4 transition-shadow",
          stuck && "shadow-lg shadow-black/40",
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <Headphones size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold">Listen to this module</h2>
          {estDurationSec ? (
            <span className="text-xs text-muted">
              ~{Math.max(1, Math.round(estDurationSec / 60))} min
            </span>
          ) : null}
        </div>
        {errored ? (
          <p className="text-sm text-muted">Audio unavailable</p>
        ) : (
          <div className="flex items-center gap-3">
            <audio
              ref={audioRef}
              src={src}
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={onPause}
              onEnded={() => setPlaying(false)}
              onError={() => setErrored(true)}
            />
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-background transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {playing ? (
                <Pause size={16} />
              ) : (
                <Play size={16} className="ml-0.5" />
              )}
            </button>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={total ?? 0}
              step={1}
              value={Math.min(currentTime, total ?? 0)}
              onChange={onSeek}
              disabled={duration === null}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand-600 disabled:cursor-default"
            />
            <span className="w-11 shrink-0 text-xs tabular-nums text-muted">
              {formatTime(total ?? NaN)}
            </span>
            <button
              type="button"
              aria-label="Playback speed"
              onClick={cycleRate}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium tabular-nums text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {rate}&times;
            </button>
            {bodyId ? (
              <button
                type="button"
                aria-label="Auto-scroll with narration"
                aria-pressed={autoScroll}
                title={
                  autoScroll
                    ? "Auto-scroll on — scrolling manually turns it off"
                    : "Auto-scroll off"
                }
                onClick={toggleAutoScroll}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  autoScroll
                    ? "border-brand-600/50 bg-brand-600/15 text-brand-600"
                    : "border-line text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <ArrowDownToLine size={14} />
              </button>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
