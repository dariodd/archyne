import { defaultHighlightStyle, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * The light theme's syntax colours: CodeMirror's own, with one repainted.
 *
 * The default style gives `typeName` and `namespace` — in a Mermaid document,
 * the keyword naming the diagram — `#008855`. That measures 4.05:1 on the
 * active line and 4.18:1 on the editor background, both under the 4.5:1 floor
 * for body text. `#00704a` is the same hue two steps down and reaches 5.52:1
 * and 5.70:1. Every other token already runs between 6.96:1 and 12.11:1, so
 * one colour is the whole failure.
 *
 * The whole default palette has to be restated to change that one colour.
 * `basicSetup` installs it as a *fallback* highlighter, and a fallback is
 * used only while no ordinary highlighter is registered — so a style holding
 * nothing but the correction did not sit on top of the defaults, it replaced
 * them. The light theme lost every colour but this one: the diagram keyword
 * was green and the rest of the document was plain text, next to four
 * colours under the dark theme.
 *
 * Appended rather than prepended, because for a token that both rules match
 * the one further down the list wins.
 */
export const lightHighlight = HighlightStyle.define([
  ...defaultHighlightStyle.specs,
  { tag: [tags.typeName, tags.namespace], color: "#00704a" },
]);
