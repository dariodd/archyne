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

Flowchart, state, ER, class, C4 and architecture. `canRender(kind)` says so, and
`renderSvg` throws `UnsupportedFamilyError` rather than returning half a picture.
Sequence diagrams are not drawn yet.

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
