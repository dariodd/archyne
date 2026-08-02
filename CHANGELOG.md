# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

Archyne is pre-1.0, so the public surface can still change between minor
versions. Once 1.0 ships, the following count as the public API for semver
purposes:

- the **`.mmd` file format contract** — in particular the `%% graph:positions`
  comment, which must always leave the file valid Mermaid
- the **embed `postMessage` protocol** (`src/embed.ts`)
- the **MCP tool names and their schemas** (`mcp/server.ts`)

Breaking any of those requires a major version. The React component structure,
CSS class names and internal store shape are _not_ public API.

## [Unreleased]

### Added

- **A multi-diagram workspace.** There was one `graph:code` key in
  localStorage, so opening a second diagram replaced the first and working on
  five meant five browser tabs. Documents now live in their own keys with a
  small index, shown as tabs under the canvas, and an existing single-document
  diagram is migrated on first load. Three things move with the document
  rather than the window: its file binding, its undo history, and the meaning
  of "New diagram" — which used to overwrite what was open.
- Group width and height can be typed in the inspector, so resizing no longer
  requires dragging a handle (WCAG 2.5.7).
- The single-key shortcuts `C` and `?` can be switched off from the overflow
  menu, remembered across sessions (WCAG 2.1.4).
- Opening a file lands in a new document rather than replacing the one on
  screen, unless that one is an untouched scratch.
- The unsaved-changes guard covers every document, not just the one on
  screen.
- **Nodes can be resized, not only groups.** Flowchart shapes and sticky
  notes take drag handles, width and height fields in the inspector, and an
  **Automatic size** button — resizing is otherwise one-way, since nothing
  about a 300×90 box says what it would have been. The size travels in the
  positions comment beside the coordinates, and only for nodes that were
  resized on purpose: writing every node's measured size would bloat the
  comment and freeze each label at whatever width it happened to render at.
- **Alignment guides while dragging.** Lines appear as a node lines up with
  another's edge or centre, and the node snaps onto them — including onto
  positions the 12px grid cannot reach on its own. Dragged groups do not
  align to the children they are carrying, and a node inside a group can
  still align to one outside it: this arithmetic is a delta, and a delta
  means the same thing in every coordinate system.
- **Align and distribute.** With two or more nodes selected the inspector
  offers the six alignments and, from three, evens out the gaps along either
  axis. Dragging gets two boxes nearly level; arithmetic gets them level —
  and this is another way to arrange a diagram without dragging anything.

### Changed

- Toasts pause while the pointer is over them or focus is inside, and resume
  with the time each had left rather than restarting (WCAG 2.2.2).
- The canvas region announces the diagram's `accTitle`, its shape in numbers,
  the author's `accDescr`, and where the readable Outline is.

### Fixed

- **Exported diagrams had solid black boxes.** `html-to-image` inlines
  computed styles for HTML elements only and copies no stylesheets, so the
  rule painting node shapes was absent from the capture and every shape fell
  back to the SVG default fill. The export now carries those rules with it,
  read from the live stylesheet so they cannot drift.
- The preview tab grew past the panel that contains it, overlapping the
  inspector and snapping back on the way to another tab.
- The preview reserves its scrollbar's width, so the diagram no longer shifts
  sideways as the scrollbar appears.
- **The editor no longer reports the store's own edits back as typing.**
  Dragging a node rewrites the positions comment, which pushed new text into
  CodeMirror, which called `onChange` — so the store recorded an undo entry
  for an edit nobody made and re-parsed 400ms later. Re-parsing identical
  code is invisible, except that it rebuilds every node from the source: a
  drag started within that window was thrown away mid-gesture.
- **A selection survives the re-parse it triggers.** Any position-only edit
  rewrites the positions comment, which schedules a re-parse; the rebuilt
  nodes came back unselected. Moving a node with the arrow keys therefore
  deselected it a moment later and the next press did nothing.

## [0.1.0-alpha.1] — 2026-08-01

First public release, deliberately labelled alpha: the editor is complete
enough to be useful and the surrounding project is honest about what has and
has not been verified, but nothing here has been exercised by anyone other
than its author.

### The editor

Two-way sync between a canvas and Mermaid source, across seven diagram
families — flowchart, state, ER, class, sequence, `architecture-beta` and C4.
Structural edits regenerate the text; dragging a node rewrites only the
trailing `%% graph:positions` comment, so a diagram stays valid Mermaid that
GitHub, Notion and `mermaid-cli` all render, while hand-arranged layout
survives save, reload and rewrites by an LLM.

Families with no visual editor — `gantt`, `pie`, `mindmap` and the rest —
open read-only rather than being rejected, with the source fully editable.

Also: undo/redo over code snapshots, copy/paste with id remapping, ELK
auto-layout in a web worker, PNG/SVG export, `.mmd` open and save-in-place
through the File System Access API, a command palette, a template gallery,
and roughly 13 000 searchable vendor icons bundled for architecture diagrams.

### Ways to run it

- The hosted demo at <https://dariodd.github.io/archyne/>
- `npx archyne`, which serves the build locally with no clone and no
  dependencies of its own
- Desktop builds for Windows, macOS and Linux, attached to this release —
  **not code-signed**; the release page explains what each platform will say
- An embeddable iframe with a default-deny `postMessage` origin allowlist
- An MCP server, so an agent can read and rewrite diagrams as text

### Accessibility

Keyboard operation of the canvas throughout: palette items place nodes,
`C` connects two of them, arrow keys move them. Dialogs trap and restore
focus. An Outline tab lists every node and its connections, because a canvas
conveys structure spatially and that is precisely what a screen reader cannot
recover. Parse errors announce through a live region wherever focus is.

`axe` reports no WCAG 2.2 AA violations across ten surfaces in both themes,
audited in a real browser. A criterion-by-criterion conformance report is
maintained privately and can be shared on request; it is a self-assessment
rather than a signed VPAT, and says why.

### Internationalisation

English, Spanish, Italian, German, Arabic, Simplified Chinese and Japanese.
Catalogues are typed against the English source, so a missing key is a
compile error, and lazily loaded, so the initial bundle grows by ~3 KB
regardless of how many exist. Right-to-left mirrors the chrome; the source
panel and canvas stay left-to-right on purpose. The translations have not
been reviewed by native speakers.

### Security

No backend, no accounts, no telemetry, and no network request of Archyne's
own — `connect-src 'self'` in the Content Security Policy states a real
invariant rather than a hope. Untrusted diagram text is held by two
independent layers, mermaid's sanitizer and the CSP, each verified separately
in a browser on every pull request. The threat model and what is in scope for
a report are in [`SECURITY.md`](SECURITY.md); a fuller architecture note is
maintained privately and can be shared on request.

Supply chain: a CycloneDX SBOM, an advisory gate on production dependencies
that requires written and expiring exceptions, a drift check on the
third-party notices, and npm publishing through trusted publishing, which
attaches SLSA provenance linking the tarball to the commit that produced it.

### What is not done

Named plainly, because an alpha that hides its edges is not an alpha:
desktop builds are unsigned; the accessibility report is a self-assessment
rather than a signed VPAT, and lists four real defects; the translations are
unreviewed; there is no multi-diagram workspace, so `localStorage` holds one
document; and there has been no independent security review.
