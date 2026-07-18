<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/wordmark-dark.png">
    <img src="public/wordmark-light.png" alt="Merflow — Visual Mermaid Editor" width="420">
  </picture>
</p>

# Merflow — visual Mermaid editor

A draw.io-style diagram editor with **two-way sync to Mermaid code**. Edit visually
(drag-and-drop, connect, rename) or edit the Mermaid text — each side updates the
other. Because the document *is* standard Mermaid, LLMs can generate, read, and
modify your diagrams as plain text, and anything they produce opens on the canvas.

Runs entirely in the browser — no server, no accounts, nothing leaves your machine.
Self-host by serving the `dist/` folder from any static file server.

## Run

```sh
npm install
npm run dev            # development, http://localhost:5173
npm run build          # production build into dist/ (static, any web server)
npm test               # round-trip parser/serializer tests
npm run mcp            # MCP server (stdio) for LLM agents
npm run mcp:smoke      # end-to-end MCP server test
npm run desktop        # desktop app (Electron shell around the build)
npm run desktop:build  # Windows installer (NSIS) into release/
```

There is no backend: the web build is static files, the desktop app is the
same build in an Electron window, and diagrams live in your files. Opening a
`.mmd` file with the desktop app loads it directly (the installer registers
the file association).

> Windows note: if `desktop:build` fails with `EPERM … rename win-unpacked`,
> your project sits in a Defender-protected folder (e.g. Documents). Build
> with the output elsewhere:
> `npx electron-builder --win -c.directories.output=%LOCALAPPDATA%\merflow-release`

## Embedding Merflow in another app

Load the app with `?embed=1` inside an iframe and talk to it over
`postMessage` (add `&origin=https://your.app` to lock messaging to your
origin; in embed mode Merflow never touches localStorage — the host owns
the data):

```html
<iframe id="mf" src="https://merflow.your.host/?embed=1"></iframe>
<script>
  const mf = document.getElementById("mf").contentWindow;
  window.addEventListener("message", (e) => {
    if (e.data.type === "ready")  mf.postMessage({ type: "load", code: "flowchart TD\n a-->b" }, "*");
    if (e.data.type === "change") save(e.data.code);          // live edits, debounced
    if (e.data.type === "exported") show(e.data.dataUrl);     // png/svg data URL
  });
  // on demand:
  mf.postMessage({ type: "getCode" }, "*");                   // → { type:"code", code }
  mf.postMessage({ type: "export", options: { format: "png", background: "light" } }, "*");
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
claude mcp add merflow -- npx tsx mcp/server.ts
```

| Tool | What it does |
| --- | --- |
| `list_diagrams` | Find all `.mmd` files under `GRAPH_DIR` (default: cwd) |
| `read_diagram` | Raw mermaid source + parsed structure (nodes/edges/groups) |
| `validate_mermaid` | Parse-check code without writing |
| `write_diagram` | Validated write; rejects broken mermaid outright |

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
included), group resizing with drag handles, snap-to-grid, double-click any
node or edge to rename it, drag-and-drop, direction switch, ELK auto-layout,
`.mmd` open/save, **PNG/SVG export** of the canvas, copy code, localStorage
autosave, live Mermaid preview tab.

## Roadmap

- Open files from disk in the app and watch for MCP-side changes (live
  agent ↔ human co-editing)
- Alignment guides; edge waypoints; resize for non-group nodes

## License

[MIT](LICENSE). Third-party dependency licenses are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — all are compatible with
MIT distribution (elkjs is EPL-2.0, consumed unmodified as a library; icon
collections are CC0, with depicted logos remaining their owners' trademarks).
The full breakdown is also available in-app: click the Merflow logo.
