/**
 * Converts a module's markdown body into plain narration text for TTS.
 *
 * Pure and deterministic — the output is hashed for change detection, so any
 * change to these transforms re-synthesizes every module's audio.
 *
 * Parsing uses the SAME remark pipeline the app renders with (react-markdown
 * = remark-parse + remark-gfm), so each segment's `blockIndex` is the index
 * of the corresponding element child of the rendered markdown container.
 * This 1:1 mapping holds because authored content contains no raw-HTML
 * blocks, link-reference definitions, or footnotes (nodes react-markdown
 * renders to nothing); mdast→hast whitespace text nodes don't count — the
 * client indexes element children only.
 */
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { ListItem, PhrasingContent, Root, RootContent } from "mdast";

const CODE_PLACEHOLDER = "There is a code example here — see the module page.";
const TABLE_PLACEHOLDER =
  "There is a comparison table here — see the module page.";

export interface SpeakableSegment {
  /** Narration text synthesized for this segment. */
  text: string;
  /**
   * Index of the corresponding element child of the rendered markdown
   * container, or null for the module title (rendered outside the body).
   * Indices are the mdast root child positions; blocks with no narration
   * (e.g. horizontal rules) simply have no segment pointing at them.
   */
  blockIndex: number | null;
}

const parser = unified().use(remarkParse).use(remarkGfm);

function ensurePeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Flatten phrasing content to readable text (link text, code contents…). */
function phrasingText(nodes: PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
      case "inlineCode":
        out += node.value;
        break;
      case "image":
        out += node.alt ?? "";
        break;
      case "break":
        out += " ";
        break;
      case "emphasis":
      case "strong":
      case "delete":
      case "link":
        out += phrasingText(node.children as PhrasingContent[]);
        break;
      default:
        // html (inline), footnoteReference, etc.: nothing readable.
        break;
    }
  }
  return out;
}

/** One sentence-ish string per list item, nested lists flattened in. */
function listItemText(item: ListItem): string {
  const parts: string[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") {
      const text = collapse(phrasingText(child.children));
      if (text) parts.push(ensurePeriod(text));
    } else if (child.type === "list") {
      for (const sub of child.children) parts.push(listItemText(sub));
    }
    // code/blockquote inside list items: not present in authored content.
  }
  return parts.filter(Boolean).join(" ");
}

/** Narration for one top-level mdast block, or null when it has none. */
function blockText(node: RootContent): string | null {
  switch (node.type) {
    case "heading": {
      const text = collapse(phrasingText(node.children));
      return text ? ensurePeriod(`Section: ${text}`) : null;
    }
    case "paragraph": {
      const text = collapse(phrasingText(node.children));
      return text || null;
    }
    case "code":
      return CODE_PLACEHOLDER;
    case "table":
      return TABLE_PLACEHOLDER;
    case "list": {
      const text = node.children.map(listItemText).filter(Boolean).join(" ");
      return text || null;
    }
    case "blockquote": {
      const parts: string[] = [];
      for (const child of node.children) {
        const text = blockText(child);
        if (text) parts.push(text);
      }
      return parts.length ? parts.join(" ") : null;
    }
    default:
      // thematicBreak, html, definitions: nothing to narrate.
      return null;
  }
}

export function toSpeakableSegments(input: {
  title: string;
  bodyMarkdown: string;
}): SpeakableSegment[] {
  const segments: SpeakableSegment[] = [
    { text: ensurePeriod(collapse(input.title)), blockIndex: null },
  ];
  const tree = parser.parse(input.bodyMarkdown) as Root;
  tree.children.forEach((node, blockIndex) => {
    const text = blockText(node);
    if (text) segments.push({ text, blockIndex });
  });
  return segments;
}

export function toSpeakableText(input: {
  title: string;
  bodyMarkdown: string;
}): string {
  return toSpeakableSegments(input)
    .map((s) => s.text)
    .join("\n\n");
}
