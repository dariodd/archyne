/**
 * Finding the Mermaid inside a Markdown file, and writing it back.
 *
 * Most Mermaid in a repository is not in a `.mmd` file — it is a fenced block
 * in a README, an ADR or a page under `docs/`. The custom editor cannot reach
 * those: it replaces the editor for a whole file, and the file here is
 * Markdown that happens to contain a diagram. What reaches them is a CodeLens
 * over the fence, and a panel bound to the block's range.
 *
 * Nothing here imports `vscode`, for the same reason `rewrite.ts` does not:
 * this is the half where the mistakes are — a range off by one line writes
 * Mermaid over somebody's prose — and the repository's own test runner can
 * hold it.
 */

/** A fenced Mermaid block, located in a document. */
export interface Fence {
  /** Its ordinal among the Mermaid blocks in the document, 0-based. */
  index: number;
  /** 0-based line of the opening fence. */
  openLine: number;
  /** 0-based first content line. */
  startLine: number;
  /**
   * 0-based line *after* the last content line — the closing fence's own line.
   * Equal to `startLine` for an empty block, which is why it is exclusive: as
   * a range it is then the insertion point where content would go.
   */
  endLine: number;
  /** The content, with the opening fence's indentation removed. */
  text: string;
  /** The opening fence's indentation, re-applied when writing back. */
  indent: string;
  /** The fence marker itself (```` ``` ````, `~~~~`, …). */
  marker: string;
}

/**
 * The info strings that mean Mermaid.
 *
 * `mermaid` is the one GitHub, GitLab and every docs tool render. `mmd` is
 * nobody's renderer but is written often enough by people naming the format
 * after the extension, and reading it costs nothing.
 */
const LANGUAGES = new Set(["mermaid", "mmd"]);

const OPEN = /^([ \t]*)(`{3,}|~{3,})[ \t]*(.*)$/;

/**
 * The language an info string names: its first word, lowercased.
 *
 * The rest belongs to whichever tool is rendering — `mermaid title="Flow"` and
 * `mermaid {caption=…}` are both a Mermaid block with something appended.
 */
function language(info: string): string {
  return info
    .trim()
    .split(/[\s,{]/, 1)[0]
    .toLowerCase();
}

/**
 * Whether this line closes a fence opened with `marker`.
 *
 * CommonMark: the same character, at least as many of them, and nothing else
 * on the line. The "nothing else" is what keeps a nested ```` ```mermaid ````
 * from closing the block it sits inside.
 */
function closes(line: string, marker: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= marker.length && trimmed === marker[0].repeat(trimmed.length);
}

/**
 * Drop the opening fence's indentation from a content line.
 *
 * Up to that much and no more, as CommonMark does — a block indented two
 * spaces inside a list item holds Mermaid that is itself indented, and taking
 * the whole of the leading whitespace would flatten the diagram's own
 * structure.
 */
function unindent(line: string, indent: string): string {
  let i = 0;
  while (i < indent.length && (line[i] === " " || line[i] === "\t")) i++;
  return line.slice(i);
}

/**
 * Every Mermaid block in a Markdown document, in document order.
 *
 * Fences are scanned linearly rather than matched by pattern, because what a
 * fence means depends on what is already open: a ```` ```mermaid ```` line
 * inside a wider ```` ````` ```` block is example text, not a diagram, and a
 * regular expression over the whole document cannot tell the difference.
 *
 * **An unclosed fence is not offered.** CommonMark ends it at the end of the
 * document, so a renderer would draw it — but a fence with no closer is far
 * more often a block being typed than one to edit, and writing back to it
 * would mean replacing everything to the last line of the file. The blast
 * radius is not worth the case.
 */
export function findMermaidFences(source: string): Fence[] {
  const lines = source.split("\n");
  const found: Fence[] = [];
  let open: { marker: string; indent: string; line: number; mermaid: boolean } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (open) {
      if (!closes(lines[i], open.marker)) continue;
      if (open.mermaid) {
        const { indent, marker } = open;
        const startLine = open.line + 1;
        found.push({
          index: found.length,
          openLine: open.line,
          startLine,
          endLine: i,
          text: lines
            .slice(startLine, i)
            .map((line) => unindent(line, indent))
            .join("\n"),
          indent,
          marker,
        });
      }
      open = null;
      continue;
    }

    const match = OPEN.exec(lines[i]);
    if (!match) continue;
    const [, indent, marker, info] = match;
    // A tilde fence may carry anything after it; a backtick fence may not
    // carry a backtick, since that is how the closer is recognised.
    if (marker[0] === "`" && info.includes("`")) continue;
    open = { marker, indent, line: i, mermaid: LANGUAGES.has(language(info)) };
  }

  return found;
}

/**
 * The block a CodeLens was created over.
 *
 * The lens carries a line number rather than a range, because between drawing
 * it and clicking it the document may have changed and it would be a range
 * into a document that no longer exists. The line is matched leniently — the
 * opening fence, the first content line, or anywhere inside — so a lens that
 * is one line stale still opens the block it was pointing at.
 */
export function fenceAt(fences: Fence[], line: number): Fence | null {
  return (
    fences.find((f) => f.openLine === line || f.startLine === line) ??
    fences.find((f) => line >= f.openLine && line <= f.endLine) ??
    null
  );
}

/**
 * The same block, after the document changed under an open panel.
 *
 * Two independent handles, because each survives what the other does not.
 * Content identifies a block that *moved* — text inserted above it shifts
 * every line number, and its own text is untouched. Ordinal position
 * identifies a block that *changed* — edited in the text editor, so its text
 * no longer matches, while it is still the second Mermaid block in the file.
 * A single edit cannot defeat both; only deleting the block defeats either,
 * which is exactly when the answer should be "gone".
 *
 * Content is tried first, and only when it is unambiguous: two identical
 * blocks in one file say nothing about which is which, and the ordinal does.
 */
export function refindFence(fences: Fence[], previous: Fence): Fence | null {
  const sameText = fences.filter((f) => f.text === previous.text);
  if (sameText.length === 1) return sameText[0];
  return fences.find((f) => f.index === previous.index) ?? null;
}

/**
 * Whether this diagram would break out of the fence holding it.
 *
 * A line of nothing but backticks *is* a closing fence, so writing one into
 * the block would end it early and turn the rest of the diagram into prose —
 * silently, in a file the diagram is only a part of. Mermaid has no reason to
 * contain one, so the answer is normally no and the write goes ahead; when it
 * is yes, refusing is the only non-destructive move available.
 */
export function wouldBreakFence(code: string, marker: string): boolean {
  return code.split("\n").some((line) => closes(line, marker));
}

/**
 * A diagram as the lines that replace a block's content.
 *
 * Carries the fence's own indentation back, and ends with a newline so the
 * closing fence keeps its own line. Blank lines are left bare rather than
 * indented into trailing whitespace, which every Markdown formatter would
 * then strip back out and call a change.
 */
export function fenceReplacement(code: string, indent: string): string {
  const body = code.replace(/\n+$/, "");
  if (body === "") return "";
  return `${body
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : indent + line))
    .join("\n")}\n`;
}

/** Where a block's content ends up after `code` is written into it. */
export function fenceAfterWrite(fence: Fence, code: string): Fence {
  const body = code.replace(/\n+$/, "");
  return {
    ...fence,
    text: body,
    endLine: fence.startLine + (body === "" ? 0 : body.split("\n").length),
  };
}
