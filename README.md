<p align="center">
  <img src="public/logo.svg" alt="Archyne" width="120">
</p>

# Archyne — a visual editor for Mermaid diagrams

A draw.io-style diagram editor with **two-way sync to Mermaid code**. Edit visually
(drag-and-drop, connect, rename) or edit the Mermaid text — each side updates the
other. Because the document _is_ standard Mermaid, LLMs can generate, read, and
modify your diagrams as plain text, and anything they produce opens on the canvas.

Runs entirely in the browser — no server, no accounts, nothing leaves your machine.
Self-host by serving the `dist/` folder from any static file server.

<p align="center">
  <a href="https://github.com/dariodd/archyne/actions/workflows/ci.yml"><img src="https://github.com/dariodd/archyne/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/archyne"><img src="https://img.shields.io/npm/v/archyne.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

## Try it

**[Open the live demo →](https://dariodd.github.io/archyne/)** — it is the same
static build, running in your browser. Nothing is uploaded.

Or run it locally, with no clone and no build:

```sh
npx archyne                 # opens http://localhost:4173
npx archyne diagram.mmd     # …with a diagram already loaded
```

Desktop builds for Windows, macOS and Linux are attached to every
[release](https://github.com/dariodd/archyne/releases/latest). They are **not
yet code-signed** — Windows warns, macOS needs one `xattr` command — and each
release page says so; the web version and `npx archyne` avoid the question
entirely.

<p align="center">
  <img src="docs/images/editor-flowchart-light.png" alt="Archyne editing a flowchart: shape palette on the left, canvas in the middle, Mermaid source on the right" width="100%">
</p>

<table>
<tr>
<td width="50%">
<img src="docs/images/editor-architecture-dark.png" alt="An architecture diagram with vendor icons for Cloudflare, AWS, Node.js, Redis and Postgres, grouped inside a VPC" width="100%">
<p align="center"><em>Architecture diagrams with 13 000+ searchable vendor icons</em></p>
</td>
<td width="50%">
<img src="docs/images/editor-sequence-dark.png" alt="A sequence diagram with participants, activations, a note and numbered messages" width="100%">
<p align="center"><em>Sequence diagrams — drag participants to reorder</em></p>
</td>
</tr>
</table>

The screenshots are generated from the real app by
`node scripts/screenshots.mjs`, so they cannot quietly go stale.

## Run

```sh
npm install
npm run dev            # development, http://localhost:5173
npm run build          # production build into dist/ (static, any web server)
npm start              # serve the build locally (same as npx archyne)
npm test               # round-trip parser/serializer tests
npm run mcp            # MCP server (stdio) for LLM agents
npm run mcp:smoke      # end-to-end MCP server test
npm run desktop        # desktop app (Electron shell around the build)
npm run desktop:build  # Windows installer (NSIS) into release/
```

There is no backend: the web build is static files, the desktop app is the
same build in an Electron window, and diagrams live in your files. Opening a
`.mmd` file with the desktop app loads it directly (the installer registers
the file association), and **Save writes back to that same file** — as it does
in the browser too, on engines with the File System Access API. Elsewhere,
Save falls back to a download.

Diagram families Archyne has no visual editor for — `gantt`, `pie`, `mindmap`
and friends — still open, rendered read-only, with the Mermaid code fully
editable and the file untouched on save.

> Windows note: if `desktop:build` fails with `EPERM … rename win-unpacked`,
> your project sits in a Defender-protected folder (e.g. Documents). Build
> with the output elsewhere:
> `npx electron-builder --win -c.directories.output=%LOCALAPPDATA%\archyne-release`

## Embedding Archyne in another app

Load the app with `?embed=1` inside an iframe and talk to it over
`postMessage`. In embed mode Archyne never touches localStorage — the host
owns the data.

The bridge is **default-deny**: you must name your origin with
`&origin=https://your.app`, and diagram content is only ever posted back to an
origin on that list. Comma-separate several if you need to. `origin=*` accepts
any parent frame and is for local development only.

```html
<iframe id="mf" src="https://archyne.your.host/?embed=1&origin=https://your.app"></iframe>
<script>
  const MF = "https://archyne.your.host";
  const mf = document.getElementById("mf").contentWindow;
  window.addEventListener("message", (e) => {
    if (e.origin !== MF) return; // verify the sender, too
    if (e.data.type === "ready")
      mf.postMessage({ type: "load", code: "flowchart TD\n a-->b" }, MF);
    if (e.data.type === "change") save(e.data.code); // live edits, debounced
    if (e.data.type === "exported") show(e.data.dataUrl); // png/svg data URL
  });
  // on demand:
  mf.postMessage({ type: "getCode" }, MF); // → { type:"code", code }
  mf.postMessage({ type: "export", options: { format: "png", background: "light" } }, MF);
</script>
```

Messages from the editor: `ready`, `loaded`, `change {code}`, `code {code}`,
`exported {format, dataUrl}`, `error {message}`. A working example ships at
`/embed-demo.html`.

## MCP server — let agents edit your diagrams

`mcp/server.ts` exposes the diagrams as MCP tools, so Claude Code (or any MCP
client) can work with them directly. The included `.mcp.json` registers it
automatically when you open this project in Claude Code; elsewhere:

```sh
claude mcp add archyne -- npx tsx mcp/server.ts
```

| Tool               | What it does                                               |
| ------------------ | ---------------------------------------------------------- |
| `list_diagrams`    | Find all `.mmd` files under `GRAPH_DIR` (default: cwd)     |
| `read_diagram`     | Raw mermaid source + parsed structure (nodes/edges/groups) |
| `validate_mermaid` | Parse-check code without writing                           |
| `write_diagram`    | Validated write; rejects broken mermaid outright           |

Writes are safe by construction: invalid code never touches disk, paths can't
escape the root, and if an agent rewrites a diagram without the
`%% graph:positions` line, the previous manual layout is carried over for the
nodes that still exist — an LLM restructuring your diagram won't scramble
your hand-arranged layout.

## How it works

- **Canvas → code**: structural edits (add/delete/connect/rename/reshape) regenerate
  the Mermaid text; dragging a node only rewrites the positions comment, leaving the
  rest of your text untouched.
- **Code → canvas**: the text is parsed with mermaid's own parser, so anything
  mermaid accepts renders on the canvas. Parse errors are shown without destroying
  the last good canvas state.
- **Positions** live in a single trailing comment the rest of the world ignores:

  ```
  %% graph:positions {"start":{"x":0,"y":0},...}
  ```

  So the file stays a 100% valid Mermaid diagram (GitHub, Notion, LLMs, mermaid-cli
  all render it), while your manual layout survives save/reload/LLM-edit cycles.
  Diagrams without a positions line are auto-laid-out with ELK.

## Current scope

Five Mermaid diagram families, all with visual editing and two-way sync:

- **Flowcharts** — all 14 vertex shapes, all edge stroke/arrow types,
  subgraphs as groups (create/dissolve from the toolbar), and full
  `classDef`/`style` round-trip with color pickers in the inspector.
- **State diagrams** (`stateDiagram-v2`) — states, start/end pseudo-states,
  transitions with labels, composite states as groups (nested transitions
  round-trip correctly).
- **ER diagrams** — entities with typed attributes/keys/comments, crow's-foot
  cardinalities, identifying vs non-identifying relationships.
- **Class diagrams** — fields and methods (with abstract/static classifiers),
  «interface» annotations, generics, namespaces as groups, sticky notes,
  inheritance/composition/aggregation/dependency markers, cardinalities,
  dotted relations.
- **Sequence diagrams** — participants/actors as draggable columns with
  lifelines (drag horizontally to reorder), messages as ordered horizontal
  arrows with all eight operators; reorder from the inspector. Notes and
  loop/alt/opt blocks are created from the palette (drop them at a row),
  renamed and deleted in place; par/critical/break blocks, activations, and
  autonumber are rendered and fully preserved through any canvas edit.
- **Architecture diagrams** (`architecture-beta`) — cloud/solution
  architecture with **vendor icons** (AWS, Azure, GCP, Kubernetes, … — the
  Iconify `logos`, `devicon`, `carbon`, `tabler` and `simple-icons`
  collections are bundled and searchable from the
  palette), nested groups for VPCs/subnets, junctions, and side-anchored
  connections with per-end arrows.
- **C4 models** (`C4Context`/`C4Container`/`C4Component`) — persons,
  systems, containers, components (with `_Ext`/db/queue variants),
  enterprise/system/container boundaries as groups, relations with
  technology labels and bidirectional arrows. The original C4 flavor and
  title round-trip.

The palette, inspector, and "New…" menu adapt to the active diagram kind.
Plus: **undo/redo** (Ctrl+Z/Y — the code being the source of truth makes
history a stack of snapshots), **copy/paste** (Ctrl+C/V, id-remapped, edges
included), group resizing with drag handles, snap-to-grid,
**alignment guides** while dragging, double-click any node or edge to rename
it, drag-and-drop, direction switch, ELK auto-layout,
`.mmd` open/save, **PNG/SVG export** of the canvas, copy code, localStorage
autosave, live Mermaid preview tab.

## Roadmap

- Open files from disk in the app and watch for MCP-side changes (live
  agent ↔ human co-editing)
- Edge waypoints; resize for non-group nodes

## For reviewers and buyers

Archyne is local-first by construction: no backend, no accounts, no
telemetry, and no network request of its own. `connect-src 'self'` in the
Content Security Policy states that as an invariant rather than a promise —
everything the editor needs, including Mermaid's renderers and the icon
collections, ships in the build.

| Document                                         | What it covers                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [Security policy](SECURITY.md)                   | The threat model, what is in scope for a report, and how to report privately |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | Dependency licences; `npm run sbom` emits a CycloneDX SBOM                   |
| [CHANGELOG.md](CHANGELOG.md)                     | What shipped, and what is deliberately unfinished                            |

Untrusted diagram text is held by two independent layers — Mermaid's
sanitizer and the CSP — each verified separately in a real browser on every
pull request. Accessibility is checked the same way: `axe` reports no WCAG
2.2 AA violations across ten interface surfaces in both themes.

Two things stated up front rather than discovered later: the desktop
installers are **not yet code-signed**, and the accessibility work is a
self-assessment rather than a signed VPAT. A fuller security architecture
note and a criterion-by-criterion conformance report exist and can be shared
on request.

## License

[MIT](LICENSE). Third-party dependency licenses are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — all are compatible with
MIT distribution (elkjs is EPL-2.0, consumed unmodified as a library; icon
collections are CC0, with depicted logos remaining their owners' trademarks).
The full breakdown is also available in-app: click the Archyne logo.

## Trademarks

Archyne is an independent project. It is **not affiliated with, endorsed by,
or sponsored by** Mermaid or Mermaid Chart.

"Mermaid" is a trademark of its respective owner. It appears here and in the
interface only to describe the file format Archyne reads and writes — the
kind of use that identifies compatibility, not origin. The Mermaid library
itself is used under its [MIT licence](https://github.com/mermaid-js/mermaid),
which grants rights over the code and none over the name.

Vendor logos in the bundled icon collections likewise remain trademarks of
their respective owners.
