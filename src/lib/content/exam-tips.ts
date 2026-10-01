/**
 * Exam tips are DERIVED from `bodyMarkdown`, not authored as their own field.
 *
 * Every module ends with an `## Exam tips` bullet list. Lifting it into the
 * schema would change the speakable text and so invalidate every entry in the
 * TTS manifest (the hash covers title + bodyMarkdown — see
 * scripts/lib/tts-synthesis.ts), re-synthesizing the whole course and dropping
 * the tips from narration. Parsing at load time keeps one source of truth.
 */

const HEADING = /^##\s+Exam tips\s*$/im;
const NEXT_H2 = /^##\s+/m;

/**
 * The bullets of a module's trailing `## Exam tips` section, as raw inline
 * markdown (bold lead-ins are common, so callers must render, not print).
 * Returns [] when the section is absent — the loader turns that into a build
 * error rather than a silently empty Review page.
 */
export function parseExamTips(bodyMarkdown: string): string[] {
  const start = HEADING.exec(bodyMarkdown);
  if (!start) return [];

  let section = bodyMarkdown.slice(start.index + start[0].length);
  const end = NEXT_H2.exec(section);
  if (end) section = section.slice(0, end.index);

  const tips: string[] = [];
  for (const line of section.split("\n")) {
    const bullet = /^[-*]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      tips.push(bullet[1].trim());
    } else if (line.trim() && tips.length > 0) {
      // Wrapped continuation of the previous bullet.
      tips[tips.length - 1] += ` ${line.trim()}`;
    }
  }
  return tips.filter(Boolean);
}
