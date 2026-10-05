import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import { resolveAccess } from "@/lib/access";
import { getModuleAudio } from "@/lib/content";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let storage: Storage | null = null;
function getStorage() {
  storage ??= new Storage();
  return storage;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Same per-request domain-gate re-check as requireUser(), but returning a
  // status code instead of redirecting — this is a media endpoint.
  const access = await resolveAccess(user.email);
  if (!access.allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const entry = getModuleAudio(moduleId);
  if (!entry) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const bucket = process.env.AUDIO_BUCKET;
  if (!bucket) {
    return Response.json(
      { error: "Audio is not configured: AUDIO_BUCKET is unset" },
      { status: 503 },
    );
  }

  const total = entry.bytes;
  let start = 0;
  let end = total - 1;
  let partial = false;

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    const first = match?.[1] ?? "";
    const last = match?.[2] ?? "";
    if (!match || (first === "" && last === "")) {
      return Response.json(
        { error: "Range not satisfiable" },
        { status: 416, headers: { "Content-Range": `bytes */${total}` } },
      );
    }
    if (first === "") {
      // Suffix range (bytes=-N): last N bytes of the object.
      start = Math.max(total - Number(last), 0);
    } else {
      start = Number(first);
      if (last !== "") end = Math.min(Number(last), total - 1);
    }
    if (start >= total || start > end) {
      return Response.json(
        { error: "Range not satisfiable" },
        { status: 416, headers: { "Content-Range": `bytes */${total}` } },
      );
    }
    partial = true;
  }

  const file = getStorage().bucket(bucket).file(entry.object);
  // GCS createReadStream bounds are inclusive, matching HTTP Range semantics.
  const nodeStream = file.createReadStream({ start, end });
  const body = Readable.toWeb(nodeStream) as ReadableStream;

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "audio/mpeg",
    "Content-Length": String(end - start + 1),
    "Cache-Control": "private, max-age=3600",
  });
  if (partial) {
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  }

  return new Response(body, { status: partial ? 206 : 200, headers });
}
