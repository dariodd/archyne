import { describe, expect, it } from "vitest";
import { defaultHighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { lightHighlight } from "./editorHighlight";

/** Every colour the style paints, in the order the rules are emitted. */
function colours(css: string): string[] {
  return [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
}

describe("the light theme's syntax colours", () => {
  const css = lightHighlight.module?.getRules() ?? "";

  it("paints the whole document and not one token of it", () => {
    // The regression this exists for: a style holding only the contrast
    // correction does not sit on top of CodeMirror's defaults, it replaces
    // them — `basicSetup` registers those as a *fallback*, and a fallback is
    // dropped the moment any ordinary highlighter is registered. The light
    // theme went down to one colour, the diagram keyword, with the rest of
    // the source plain black beside four colours under the dark theme.
    expect(new Set(colours(css)).size).toBeGreaterThan(4);
  });

  it("keeps every tag the default style paints", () => {
    const covered = new Set(defaultHighlightStyle.specs.flatMap((spec) => [spec.tag].flat()));
    const ours = new Set(lightHighlight.specs.flatMap((spec) => [spec.tag].flat()));
    expect([...covered].filter((tag) => !ours.has(tag))).toEqual([]);
  });

  it("repaints the diagram keyword, and does it last so it wins", () => {
    // `typeName` is the keyword naming the diagram. CodeMirror's #008855 is
    // 4.05:1 on the active line, under the 4.5:1 floor; this is the same hue
    // two steps down. Both rules match the tag, so the later one has to be
    // ours — CSS precedence follows the order the specs are declared in.
    const emitted = colours(css);
    expect(emitted).toContain("#00704a");
    expect(emitted.lastIndexOf("#00704a")).toBeGreaterThan(emitted.indexOf("#008855"));

    const last = lightHighlight.specs[lightHighlight.specs.length - 1];
    expect([last.tag].flat()).toEqual([tags.typeName, tags.namespace]);
  });
});
