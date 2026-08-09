/**
 * Reading a Mermaid label as text.
 *
 * A Mermaid label, drawn as text.
 *
 * Mermaid labels are HTML-ish in two small ways, and both were reaching the
 * canvas as characters: `<br>` is how a label holds more than one line, and
 * `&amp;` is what Mermaid's own parser hands back for `&` once a label
 * contains any markup. A node whose text read `Route53<br>DNS &amp; DDoS`
 * therefore *said* that, which is not what anyone wrote.
 *
 * This is deliberately not `dangerouslySetInnerHTML`: diagram text is
 * untrusted — it arrives from files, from imports, and from agents over MCP —
 * so the string is split into lines and the handful of named entities are
 * decoded, and everything else stays literal text. There is no path here that
 * can put markup from a diagram into the document.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  // Mermaid's own escape for a quote inside a quoted label.
  "#quot;": '"',
};

/** Decode the entities Mermaid produces, and nothing else. */
export function decodeLabel(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);|#quot;/g, (m) => ENTITIES[m] ?? m);
}

/** Split on every spelling of a Mermaid line break. */
export function labelLines(text: string): string[] {
  return decodeLabel(text).split(/<br\s*\/?>/i);
}
