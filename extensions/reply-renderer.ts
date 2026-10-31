/**
 * reply-renderer: lets the agent colour parts of its replies in the TUI.
 *
 * The agent writes plain-text tags in its reply:
 *
 *   <textcolour=red,bold>this text renders red and bold</textcolour>
 *
 * The transformer strips the tags and embeds ANSI codes before the Markdown
 * component renders the message; the raw session keeps the tagged text.
 * A coloured span ends at a fenced block, a blank line, or </textcolour>.
 * Tags inside fenced code blocks stay raw. Unknown
 * style names leave the tags visible so the model can see and correct them.
 *
 * Tag spellings: textcolour, textcolor, text-color (for both tags).
 * Styles, comma-separated inside the opening tag, no spaces:
 *   colours: black red green yellow blue magenta cyan white gray grey
 *   modifiers: bold dim italic underline
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";


const BASE_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  grey: 90,
};


const MODIFIERS: Record<string, string> = {
  bold: "1",
  dim: "2",
  italic: "3",
  underline: "4",
};

const RESET = "\x1b[0m";

const FENCE_OR_TAG =
  /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))|(<(?:textcolour|textcolor|text-color)\s*=\s*([^>\n]*?)\s*>)|(<\/(?:textcolour|textcolor|text-color)\s*>)/gi;
const GUIDELINE = `## Reply text colouring (TUI only)

When it helps the reader, you may colour parts of a reply for the terminal by
wrapping the text:

<textcolour=red>renders red in the terminal</textcolour>

Definition:
- Tags: <textcolour=SPEC> starts coloured text and </textcolour> ends it.
  The spellings textcolour, textcolor, and text-color are all accepted for
  both tags.
- SPEC is one or more comma-separated style names, no spaces:
  <textcolour=bold,red>.
- Colours: black, red, green, yellow, blue, magenta, cyan, white, gray.
- Modifiers: bold, dim, italic, underline.
- A coloured span ends at the closing tag, at a fenced code block, or at a
  blank line, because a rendered paragraph breaks the style. Wrap each
  paragraph that should be coloured in its own tags.
- Colouring is TUI rendering only: session files and HTML exports keep the
  raw tags.
ponvp
Use sparingly: colour only the part that needs attention, for example a
question that waits for the user's input or ack, a warning, or a
confirmation request.

Style preferences the user has set:
- Explanations, summaries and normal prose stay the default colour. Colour
  marks a category, never decoration.
- Emergencies, anything that can lose data or user state or exposes a
  security problem: <textcolour=bold,red>.
- Questions, options to confirm, and anything waiting for the user's input
  or ack: <textcolour=magenta>. Add bold, italic, or underline to the spec
  only when you think the emphasis is right.`;

/** Build the ANSI prefix for a spec, or undefined for an unknown style. */
function styleToAnsi(spec: string): string | undefined {
  const names = spec
    .toLowerCase()
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return undefined;

  const codes: string[] = [];
  for (const name of names) {
    if (name in MODIFIERS) {
      codes.push(MODIFIERS[name]);
      continue;
    }
    const base = BASE_COLORS[name];
    if (base === undefined) return undefined;
    codes.push(String(base));
  }
  return `\x1b[${codes.join(";")}m`;
}


/** Transform markdown for the TUI: replace textcolour tags with ANSI codes. */
function transform(markdown: string): string {
  let result = "";
  let activeAnsi: string | undefined;
  let lastIndex = 0;

  for (const match of markdown.matchAll(FENCE_OR_TAG)) {
    const [fenceOrTag, fence, openingTag, spec, closingTag] = match;
    const start = match.index ?? 0;

    result += activeAnsi ? activeAnsi + markdown.slice(lastIndex, start) : markdown.slice(lastIndex, start);
    if (fence) {
      result += (activeAnsi ? RESET : "") + fence;
      activeAnsi = undefined;
    } else if (openingTag !== undefined) {
      const ansi = styleToAnsi(spec ?? "");
      if (ansi) {
        if (activeAnsi) result += RESET;
        activeAnsi = ansi;
      } else {
        result += (activeAnsi ? RESET : "") + openingTag;
        activeAnsi = undefined;
      }
    } else if (closingTag !== undefined) {
      result += activeAnsi ? RESET : "";
      activeAnsi = undefined;
    }
    lastIndex = start + fenceOrTag.length;
  }

  result += activeAnsi ? activeAnsi + markdown.slice(lastIndex) + RESET : markdown.slice(lastIndex);
  return result;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    event.systemPromptOptions.sections.reply_renderer = GUIDELINE;
  });

  pi.registerMarkdownTransformer((markdown) => transform(markdown));
}
