# archyne-render

Draw a Mermaid diagram as a self-contained SVG string — real geometry, real
text, and its own colours inlined, so the picture survives the page that made
it.

This is [Archyne](https://github.com/dariodd/archyne)'s renderer, extracted. It
is **not an alternative to Mermaid**: Mermaid does the parsing, and this draws
what it parsed. If you already have Mermaid, you already have half of it.

## Install

```sh
npm install archyne-render
```

`mermaid` is an optional peer dependency, needed only for the `/mermaid` entry
point. `elkjs` comes along, and is loaded lazily — a document that carries its
own layout never touches it.

## Two entry points

They differ in what they cost, which is why they are separate.

```js
import { renderSvg } from "archyne-render";
```

Draws a graph you have already parsed and laid out. Runs anywhere JavaScript
does — **no DOM, no Mermaid, no dependencies at all**.

```js
import { render } from "archyne-render/mermaid";

const { svg, width, height } = await render(`
flowchart TD
  a["Start"] --> b["Finish"]
`);
```

Parses with Mermaid and lays out with ELK. Needs a DOM: Mermaid's parser runs
every label through DOMPurify, which wants a `window`. In a browser or a webview
that is free; in Node, give it jsdom before importing:

```js
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { render } = await import("archyne-render/mermaid");
```

Text is measured a little differently in the two places, and it is worth knowing
which you are in. A browser is asked directly, through canvas `measureText`, and
the answer is exact. Node has no canvas — jsdom does not implement one — so
widths are summed from a table of per-glyph advances measured from the same
fonts. On a typical label the two agree to the rounding; what the table cannot
see is kerning, so a string like "AVATAR" comes out a few percent wide. It errs
wide rather than narrow, which is the harmless direction: a box slightly too big
clips nothing.

## Three ways to plug it in

Whatever draws your Markdown — VS Code's built-in preview, Markdown Preview
Enhanced, a static site generator, a build script — it is one of three shapes.
The difference between them is not the tool: it is **where the code runs**, and
therefore whether there is a DOM.

The code below is not an illustration. `tests/e2e-recipes.mts` in the Archyne
repository extracts these blocks from this file and runs them, so a recipe that
stopped working fails a build rather than wasting your afternoon.

### 1. In a preview that runs your script

VS Code's built-in Markdown preview, MPE's preview, any Electron page. A webview
is a real browser, so this is the easy one: Mermaid's parser has its DOM and the
text measurement is exact.

<!-- recipe:webview -->

```js
import { render } from "archyne-render/mermaid";

// Inside a function, not at the top level. A preview script is injected as a
// classic `<script>`, which cannot have top-level `await` — and bundling one to
// `iife` fails outright rather than at run time.
async function drawAll() {
  // Whatever your host turns a mermaid fence into. In VS Code's preview a
  // markdown-it plugin makes `<pre class="diagram">source</pre>`.
  for (const el of document.querySelectorAll("pre.diagram")) {
    const source = el.dataset.source ?? el.textContent ?? "";
    if (el.dataset.done === source) continue; // previews redraw on every keystroke
    el.dataset.source = source;
    el.dataset.done = source;
    const { svg } = await render(source, { theme: "dark", background: false });
    el.innerHTML = svg;
  }
}

// Previews swap their DOM in on every edit, so redraw when it changes.
new MutationObserver(() => void drawAll()).observe(document.body, {
  childList: true,
  subtree: true,
});
void drawAll();
```

Bundle it: a webview has no module resolution, so Mermaid and ELK have to be in
the file you ship. That is a few megabytes, and it is what drawing diagrams in a
preview costs — Mermaid's own extension pays the same.

### 2. In Node, before the page is built

MPE's `~/.crossnote/parser.js`, a markdown-it plugin in a static site generator,
anything that rewrites the document server-side. There is no DOM here, and
Mermaid's parser wants one — so bring jsdom.

The payoff is that the SVG is _in the HTML_: it survives export to HTML and PDF,
which a preview-only script does not.

<!-- recipe:node -->

````js
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { render } = await import("archyne-render/mermaid");

/** Replace every mermaid fence in a Markdown document with its picture. */
export async function drawFences(markdown) {
  const fences = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  let out = markdown;
  for (const [whole, source] of fences) {
    const { svg } = await render(source, { background: false });
    out = out.replace(whole, svg);
  }
  return out;
}
````

### 3. Rendered to files, ahead of time

A build step or a file watcher that turns each fence into a `.svg` beside the
document and rewrites the fence to an image. Ugly, and it works **everywhere** —
GitHub, a wiki, a PDF pipeline, a preview that has never heard of Archyne. It
asks nobody's permission.

<!-- recipe:files -->

````js
import { writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { render } = await import("archyne-render/mermaid");

/** Write each fence to `<name>-<n>.svg` and point the document at it. */
export async function extractFences(markdown, name, dir) {
  const fences = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  let out = markdown;
  for (const [i, [whole, source]] of fences.entries()) {
    const file = `${name}-${i + 1}.svg`;
    const { svg } = await render(source);
    await writeFile(`${dir}/${file}`, svg, "utf8");
    out = out.replace(whole, `![](${file})`);
  }
  return out;
}
````

Note what this one needs that the others do not: the SVG has to render as an
`<img>`, with no help from the page. It does — the labels are `<text>`, not a
`<foreignObject>`, which is the difference between this working and coming back
as boxes with no words in them.

## Rendering a whole directory

`render()` is safe to call concurrently and will not go any faster for it.
Mermaid's parser keeps one database per diagram family, as a module singleton
that every parse clears before it starts, so all parsing here goes through a
lock. `Promise.all` over five hundred fences is correct and finishes in the same
time as a `for` loop: **throughput is one diagram at a time, per process.**

If that is too slow, the unit to multiply is the process — a worker pool, one
`render()` at a time in each — not the number of calls in flight. A rejected
parse does not strand the ones queued behind it, so one malformed diagram in a
directory costs you that diagram and nothing else.

## What the output is

Geometry as `<rect>`, `<path>` and `<polygon>`; labels as `<text>` with the line
breaks worked out from measured widths; the palette inlined as a `<style>`
inside the `<svg>`. Nothing resolves against the host page, so the file renders
in an `<img>`, on GitHub, in resvg or librsvg, and in a PDF pipeline — not only
in a browser.

Mermaid's own default output puts labels in a `<foreignObject>`, which those
renderers do not paint. This does not.

## It does not look like Mermaid

That is the point rather than an oversight. Edges are routed orthogonally, with
stubs off each face, rounded corners, hops where two lines cross, and parallel
edges spread apart. Nodes are sized and laid out by ELK. The same source drawn
by Mermaid will look different.

## Families

All seven that Archyne edits: flowchart, state, ER, class, C4, architecture and
sequence. `canRender(kind)` says so, and `renderSvg` throws
`UnsupportedFamilyError` for a kind it does not know rather than returning half
a picture.

A sequence diagram needs its statement stream as well as its nodes and edges —
its rows _are_ its layout. `render()` supplies it from the parse; a caller of
`renderSvg` passes `seqItems`.

## Icons

Architecture services draw an icon when you supply one, and a labelled box when
you do not. They are injected rather than bundled — five Iconify collections is
1.8 MB, and a flowchart should not pay for them:

```js
import { iconNames } from "archyne-render/mermaid";

const icons = Object.fromEntries(
  await Promise.all(iconNames(nodes).map(async (n) => [n, await yourLoader(n)])),
);
renderSvg(nodes, edges, "architecture", { icons });
```

Markup passed this way is inserted verbatim. Sanitise anything you did not
author.

## Options

| Option       | Meaning                               |
| ------------ | ------------------------------------- |
| `theme`      | `"dark"` (default) or `"light"`       |
| `padding`    | Space around the diagram, in px       |
| `background` | `false` leaves the ground transparent |
| `icons`      | Resolved icon markup, by name         |

## Licence

MIT, the same as Archyne.
