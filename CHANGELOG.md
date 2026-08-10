# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

Archyne is pre-1.0, so the public surface can still change between minor
versions. Once 1.0 ships, the following count as the public API for semver
purposes:

- the **`.mmd` file format contract** — in particular the `%% graph:positions`
  and `%% graph:waypoints` comments, which must always leave the file valid
  Mermaid
- the **embed `postMessage` protocol** (`src/embed.ts`)
- the **MCP tool names and their schemas** (`mcp/server.ts`)

Breaking any of those requires a major version. The React component structure,
CSS class names and internal store shape are _not_ public API.

## [0.2.1] — 2026-08-10

Work on the editing surface itself: the source panel becomes an editor you
can size and read, and three defects in how icons behave are fixed — one of
which meant that clicking an icon sometimes did nothing at all.

There is no 0.2.0 release: that version number was taken on npm by a
publishing rehearsal in the days before the repository was recreated, so the
0.2 line continues here. This is also the first release published under
npm's `latest` tag rather than `next`; it is still pre-1.0, and the caveats
listed under "What is not done" in the 0.1.0-alpha.1 notes still stand
except where a release since has named them fixed.

### Added

- **The side panel can be resized.** 380px is a reasonable guess and it is
  only ever a guess: a wide diagram wants the canvas, and reading somebody
  else's Mermaid wants the code. The divider between them is draggable, and
  a real `role="separator"` with a value rather than a bare div with a mouse
  handler — arrow keys move it, Home or End put it back, and so does a
  double-click. The width is remembered.

  Fitting that width to the window is left to the stylesheet's `clamp()`
  rather than done by rewriting the stored number on every resize, so a
  panel dragged wide on an external monitor narrows to fit the laptop and is
  itself again when the monitor comes back.

- **The code has a type size, as in any editor.** `Ctrl+=` and `Ctrl+-`,
  `Ctrl+wheel`, or the `A−`/`A+` buttons above the editor; `Ctrl+0` returns
  to the default. It is stored rather than left to the browser's zoom
  because zooming the page also zooms the canvas, and the point is to read
  the code without shrinking the diagram. Three spellings of the same press
  are bound, since on an Italian keyboard `+` is a shifted key and `=` is
  not where a US layout puts it.

- **Formatting, on `Shift+Alt+F` or the Format button.** Deliberately
  whitespace only: indentation per block depth, trailing spaces dropped,
  runs of blank lines collapsed. Mermaid does not care about indentation, so
  a formatter that only touches it cannot change what a diagram draws, while
  one that rewrites statements could — and a formatter that occasionally
  changes your diagram is one nobody dares press twice.

  Block keywords are scoped to the family that defines them: `opt` opens a
  block in a sequence diagram and is a perfectly good node id in a
  flowchart. The output matches what the app's own serializers emit, so
  formatting a file and then dragging a node in it do not produce rival
  diffs, and running it twice changes nothing the second time.

- **The `%% graph:…` sections are folded away by default.** They are how a
  diagram keeps its arrangement in a file that has to stay valid Mermaid:
  written by the app, never edited by hand, and occasionally enormous — a
  single `graph:icons` line can carry a whole imported SVG. Folded rather
  than hidden, into one line that names what it holds, because the file is
  the source of truth and a section you can open is a section you can check.
  Opening it is remembered.

  Every edit made on the canvas replaces the whole document in the editor,
  which discards its folds — and the edit that does so is very often a drag
  rewriting `graph:positions`. The fold is re-applied after each of those,
  so the section does not spring open the first time a node moves.

- **The icon picker says which icon is under the pointer.** A search for
  "postgres" answers with the same logo from four collections, told apart
  only by name, and the name was in a `title` attribute — a second of
  hovering, and nothing at all for the keyboard.

### Fixed

- **Picking an icon sometimes did nothing.** `IconView` draws its SVG
  through `innerHTML`, so every re-render replaced the icon's `<svg>` node —
  and a browser only fires a `click` when the press and the release land on
  a node that is still in the document. Any re-render between mousedown and
  mouseup therefore ate the click: the icon you clicked was not applied, in
  the picker and in the shapes palette both, with no error anywhere. The
  component is memoised and its markup kept stable, and the case is now
  covered by a browser test that clicks the ordinary, fast way — hovering
  first and then clicking quietly avoids the bug and proves nothing.

- **The picker's icons were browser default buttons.** The only rules for
  them were the palette's, so everywhere else they fell through to the
  system button: in a dark interface, a grey slab with a white outset border
  stretched to the full width of its grid column, 197px of chrome around a
  26px icon. The grid is now sized for the dialog it is in rather than
  inheriting a 170px palette's four columns, and "Choose icon…" is drawn
  like the two import buttons beside it instead of being the odd one out.

- **A picture on a flowchart node hung out of its shape.** Mermaid's image
  shape puts a 60px picture and a label inside a box 54px tall, and the
  block holding them had no height to be measured against, so the picture
  spilled 13px out of the top and the label 19px out of the bottom. The
  picture is now fitted into the shape — the shape is not grown around the
  picture, since a node's size is the author's — and a node resized smaller
  than its picture shrinks the picture rather than letting it escape again.
  The button that changes that picture also shows it, which it never did.

- **The shapes palette no longer changes width with the diagram type.** The
  architecture palette gave itself 200px against everyone else's 170, so
  choosing "Architecture" from the kind menu widened the left column and
  shoved the canvas sideways mid-edit. The columns hold still across a
  change that is about the diagram rather than about the window.

- **The icon controls line up with the fields around them.** The inspector
  puts its 12px inset on each field rather than on the panel, and the row of
  icon buttons did not carry it — so it started 12px to the left of every
  input above and below it, and sat flush against the field it belongs to.

## [0.2.0-alpha.1] — 2026-08-10

A minor bump rather than a patch: this adds a whole import subsystem — six
foreign formats, each previewed before it lands — a PDF export path, and a
multi-diagram workspace, which the 0.1.0-alpha.1 notes listed under "what is
not done". Still alpha, and the caveats in that section still stand except
where this release names them fixed.

### Added

- **Line breaks in a label are drawn as line breaks.** A Mermaid label holds
  more than one line as `<br>`, and Mermaid's own parser hands `&` back as
  `&amp;` once a label contains any markup — and the canvas was drawing both
  as characters. A node that should have read "Route53 / Cloudflare / DNS &
  Protezione DDoS" over two lines instead _said_
  `Route53 / Cloudflare<br>DNS &amp; Protezione DDoS` on one. It affected
  hand-written diagrams too, but an import produces such labels by the dozen,
  so every imported diagram looked broken.

  Deliberately not `dangerouslySetInnerHTML`: diagram text is untrusted — it
  comes from files, from imports, and from agents over MCP — so the string is
  split into lines and the handful of named entities decoded, and everything
  else stays literal text.

- **The import preview lets you overrule the family it chose.** Detection is a
  guess: a PlantUML file could be a sequence, class or state diagram, and a
  DOT file could be a graph or a class model. Where a source can be read more
  than one way the preview offers **Read as** and converts again, so the
  choice is made by whoever knows, and seen before it lands.

- **A cloud import keeps the arrangement it was drawn in.**
  `architecture-beta` has no coordinates, so the converter was throwing the
  geometry away and leaving the whole drawing to a layout engine — a wide
  diagram of subnets came back as a tall column with its connections crossing
  it. But Archyne's own `%% graph:positions` comment is read for _every_
  diagram family, not just flowcharts, so the places are kept there and the
  import opens looking like the file it came from. Groups keep their size too;
  a service keeps only its position, because it sizes itself around its own
  name and the box it happened to occupy in draw.io cropped that off.

- **Both preview panes are the same instrument.** The canvas is React Flow,
  which brings wheel-zoom, drag-to-pan and a fit button; the Mermaid rendering
  was one fixed picture in a scroll box with a pair of percentage buttons
  bolted beside it. Switching between the two meant switching how you look at
  things, which is a poor thing to ask of somebody comparing them. The
  rendering now pans and zooms with the same gestures — the wheel zooms about
  the pointer rather than about a corner — and its controls sit where React
  Flow's do and do the same three things.

- **The canvas components no longer reach for the open document.** The
  editor's edge components read `useGraphStore` directly to route a
  connection, which quietly meant _the_ open diagram. That was invisible until
  something else wanted to draw a canvas — the import preview shows a diagram
  that has deliberately not been loaded, so every connection came out missing.
  The graph now arrives through a context: the editor provides none and the
  store is used exactly as before, while a preview provides a static one and
  is read-only by construction, since a static graph has nowhere to put an
  edit. The preview draws with the editor's own router as a result — the same
  orthogonal paths, the same fan-out where several connections share a pair,
  the same hand-routed corners — instead of the stand-in that curved lines
  across the diagram.

- **A cloud drawing is imported as an architecture diagram.** A VPC with
  subnets and a database is not a flowchart, and reading it as one threw away
  the part that makes it legible: the icons. A draw.io file drawn with AWS,
  Azure, GCP or Kubernetes stencils now becomes `architecture-beta`, with the
  stencil turned into one of the 16 600 vendor icons already in the build,
  containers as groups, and each connection anchored on the side the other
  end actually lies — the only layout information that format can hold.

  Two things the grammar insists on, found by looking at the preview rather
  than by reading a specification: `architecture-beta` ids must be lower case,
  and a label takes letters, digits, spaces and underscores and nothing else,
  so `Amazon VPC (10.0.0.0/16)` would otherwise fail the whole document. The
  bracketed detail is dropped and the rest cleaned.

- **The preview shows the canvas, the render and the code.** It opens on a
  read-only Archyne canvas built from the same node components the editor
  draws with — so it is not an approximation of what you will get, it is what
  you will get — with React Flow's own zoom and pan for judging a large
  drawing. Two buttons switch to Mermaid's own rendering and to the generated
  source. The **Read as** control is always shown rather than only when there
  is a choice, because what it decided is worth stating even when it is the
  only option.

- **Every import is previewed before it lands.** A conversion is lossy by
  construction, and it was landing on the canvas before anyone could judge it
  — replacing what was on screen, with the caveats going by in a stack of
  toasts. The importer now runs first and puts its result up: the diagram
  drawn by Mermaid's own renderer, what family it became, the counts, and each
  caveat that applies — pages skipped, elements with no equivalent, a drawing
  that looked like a different sort of diagram. A button flips the pane to the
  generated Mermaid. Cancel costs nothing, because nothing has been placed.

  It covers every route in: the Import action, the fallback file input, and a
  file the desktop shell hands over. A `.mmd` is placed straight away — there
  is no conversion to check, so a dialog would only be in the way.

- **Import is its own action, and the diagram family is read off the file.**
  Converting a `.drawio` was hiding behind **Open**, which was the wrong word
  for it: opening a file means editing it and saving it back, and an import is
  never written back. **Import…** now sits in the overflow menu with its own
  file filters, and Open offers only what Save writes. Content still decides
  what a file is, so Open on a foreign file keeps working rather than
  reporting that it is not valid Mermaid.

  Each importer also chose one target family and stayed there, so a PlantUML
  class diagram was refused and a DOT class model came across as boxes full of
  pipe characters. The three _text_ formats say what they are, so now the
  family is read off the file:

  - **PlantUML class diagrams** become Mermaid class diagrams — classes with
    their fields and methods, `<<interface>>`/`<<abstract>>`/`<<enumeration>>`
    annotations, generics, packages as namespaces, and the extension,
    composition, aggregation and dependency relations with their cardinalities.
  - **PlantUML state diagrams** become `stateDiagram-v2` — states,
    transitions with labels, `[*]` at both ends, `<<choice>>` pseudostates and
    composite states as nested blocks. A composite named by a transition
    before it is opened now _becomes_ that state rather than appearing twice.
  - **Graphviz record labels** become a class diagram. A pipe-separated
    `record` label is how doxygen draws UML, and `dir=back` — its idiom for
    inheritance — is honoured so the arrow does not gain a second head.

  The three _drawing_ formats do not say what they are: draw.io, Visio and
  Excalidraw put every kind of diagram on one canvas. Those still import as
  flowcharts, but a draw.io file is checked for the tell-tale styles and one
  that looks like a sequence, ER or class diagram says so on import instead of
  leaving you to work out why it arrived as boxes.

- **Four more formats can be opened: SQL DDL, PlantUML, Visio and
  Excalidraw.** With draw.io and Graphviz that makes six, all through one
  sniff-and-dispatch point, all producing an ordinary Mermaid document, and
  none of them ever written back to.

  - **SQL DDL** (`.sql`, `.ddl`) becomes an **ER diagram** — the one import
    that is not a flowchart. Tables are entities and columns are typed
    attributes, and a foreign key's cardinality is read off the constraints
    rather than guessed: many at the child end unless the column is unique,
    optional at the parent end when it is nullable, and identifying only when
    the key is part of the child's own primary key. Dialect-agnostic, and
    shallow on purpose — views, triggers, grants and indexes are stepped over,
    so a whole `pg_dump` opens rather than a hand-trimmed excerpt. Constraints
    added afterwards by `ALTER TABLE`, which is how a dump always writes them,
    count the same as inline ones.
  - **PlantUML** (`.puml`, `.plantuml`, `.iuml`, `.wsd`) becomes a **sequence
    diagram**, and only that. PlantUML is a dozen languages behind one pair of
    markers; a class, state or component diagram is refused _by name_ instead
    of being half-converted into something that has to be checked line by
    line. Participants, messages and arrow styles, activation, notes and the
    `alt`/`opt`/`loop`/`par` blocks all come across.
  - **Visio** (`.vsdx`) is read out of its package: shapes and their text, the
    shape each master suggests, literal colours, the `<Connects>` table as
    edges, and the geometry — centres in inches measured up from the bottom of
    the sheet, turned into corners in pixels measured down from the top. This
    is the first format that is not text, so a binary file now travels from
    the picker to the importer as bytes rather than as UTF-8 that has already
    destroyed it.
  - **Excalidraw** (`.excalidraw`) gives up its boxes, ellipses and diamonds
    with the text bound to them, the arrows its bindings name — not the ones
    that merely look attached — frames as containers, and the positions.

- **Graphviz DOT files can be opened.** `.dot` and `.gv`, directed or not,
  `strict` or not. Unlike draw.io there is almost nothing to lose in the
  crossing — DOT describes a graph rather than a drawing, exactly as Mermaid
  does — so nodes, edges, shapes, colours, `rankdir`, edge labels, line styles
  and `cluster_*` containers all come across, while plain subgraphs stay
  invisible as they are in Graphviz. A graph with no coordinates is laid out
  with ELK; one that has been through `dot -Tdot` keeps the positions it
  already has.

  The point is the DOT nobody writes by hand: `terraform graph`,
  `go mod graph`, doxygen, dbt and most build tools emit it, and until now it
  was something you squinted at in whichever viewer was nearest. The grammar
  is small enough to parse properly, so there is a tokeniser and a
  recursive-descent parser rather than regular expressions, which come apart
  on the first quoted brace — and a generated file is full of quoted braces.

- **draw.io files can be opened.** Archyne could read exactly one format,
  which is a hard thing to ask of somebody with a folder of `.drawio` files
  and no way in. `Open` now takes them — both the plain and the compressed
  form, and the `.xml` older versions write — and converts them to a Mermaid
  flowchart: boxes, labels, shapes, colours, connections with their labels and
  line styles, swimlanes and containers as subgraphs, and the geometry, which
  goes into `%% graph:positions` so an imported diagram opens where it was
  drawn instead of being re-laid-out. Hand-routed corners come across too.

  It is a migration and not a mirror, and says so: a file with several pages
  converts the first and tells you, anything with no Mermaid equivalent is
  counted rather than dropped in silence, and the fourteen vertex shapes are
  matched as closely as draw.io's thousands allow. Two details worth their
  own line: node ids are named after the labels, because generated source
  nobody can read defeats the point of importing into Mermaid at all; and a
  pale draw.io fill is given dark text, because those palettes are drawn for
  black-on-white and the labels were otherwise invisible on Archyne's canvas.

  **The file it came from is never written to.** An import arrives unbound —
  no path, no handle — so Save is Save-as into a new `.mmd`, and a `.drawio`
  cannot be replaced by Mermaid its own editor could not open.

- **PDF export, and export straight to the clipboard.** PNG and SVG covered
  the web and the design tool; the formats a diagram is actually filed in —
  a report, a slide deck, something printed — were left to the user to
  convert. Export now offers PDF as a third format: one page, either cut to
  the diagram or centred on A4 or Letter, turned landscape when the diagram
  is wider than it is tall, and never enlarged to fill a sheet it does not
  need. Alongside it, **Copy image** puts the diagram on the clipboard ready
  to paste, and copies the markup instead when the format is SVG.

  The page holds the diagram as a losslessly compressed image at the chosen
  quality, not as vector paths: vector would mean translating the canvas to
  PDF drawing operators and embedding a font subset for every label, and the
  two libraries that do it are together larger than the whole initial bundle.
  3× is 288 dpi and prints cleanly; SVG stays the answer where the artwork
  has to scale without limit. The writer is Archyne's own — no dependency was
  added, and it is fetched only when someone exports a PDF, so the initial
  bundle is unchanged.

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
- **Open files are watched for changes made outside the app.** The MCP server
  writes `.mmd` files straight to disk, so an agent asked to restructure a
  diagram edits the file the editor has open — and the editor kept showing the
  version it read at open time until the next save quietly overwrote the
  agent's work. A changed file now lands on the canvas within a couple of
  seconds, including for documents open in other tabs of the workspace.
  A document with unsaved changes is never overwritten: the change is
  announced and the work stays, with **Reload from disk** in the overflow menu
  as the way to the other version.
- **Edges can be routed by hand.** Selecting an edge puts a handle in the
  middle of each segment; dragging one out of the line makes a corner, which
  can then be moved, double-clicked away, or typed as numbers in the
  inspector. The corners live in their own `%% graph:waypoints` comment,
  keyed by the edge's endpoints rather than by its index — inserting a line
  above an edge renames it, and the corners would otherwise follow the wrong
  connection. Straightening an edge takes the comment out of the file with
  it.
- **Nodes can be resized, not only groups.** Flowchart shapes, sticky notes,
  states, ER entities, classes, architecture services and C4 elements take
  drag handles, width and height fields in the inspector, and an
  **Automatic size** button — resizing is otherwise one-way, since nothing
  about a 300×90 box says what it would have been. The size travels in the
  positions comment beside the coordinates, and only for nodes that were
  resized on purpose: writing every node's measured size would bloat the
  comment and freeze each label at whatever width it happened to render at.
  Notation keeps its own size — a junction is a dot, a fork bar is a bar, and
  a sequence participant's geometry belongs to the overlay.
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
- **The keyword naming the diagram now meets AA in the light theme.**
  CodeMirror's default colour for it, `#008855`, measured 4.05:1 on the
  active line and 4.18:1 on the editor background, against a 4.5:1 floor —
  so the first line of every document failed. It is `#00704a` now, 5.52:1
  and 5.70:1. It had been that way since the light theme existed;
  `axe-core` 4.13.0 is simply the first version to report it.

### Security

- **Every dependency advisory is closed.** `ip-address` 10.4.0 clears
  GHSA-mwp4-54f8-5fhr, a high reaching the tree through the MCP SDK's
  `express-rate-limit`, which the advisory gate had been failing on;
  `hono` 4.13.1 closes twenty-eight; `dompurify` 3.4.13 the detached-subtree
  XSS; and `mermaid` 11.16.1 five against the renderer — prototype pollution
  through the configuration APIs and architecture diagrams, CSS injection
  into siblings of the diagram, and the XY-chart and radar loops. The gate
  reports no advisories at all, in any severity.
- These are lockfile changes: the ranges in `package.json` already admitted
  every one of them, so an install of this package from the registry
  resolved the fixed versions regardless. What the lockfile governs, and
  what this therefore does change, is the desktop installers and CI.

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
