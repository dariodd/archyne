# Archyne for VS Code

Draw Mermaid diagrams on a canvas, in the editor that already has the file
open. The diagram stays an ordinary `.mmd` file: VS Code owns it, so the dirty
dot, undo, save and the diff against `HEAD` all behave exactly as they do for
the text.

Nothing leaves your machine. The editor is bundled — no service, no account,
no network call of its own.

## Getting started

Open a `.mmd` or `.mermaid` file, then run **Archyne: Open on the canvas**
from the command palette, or use **Reopen Editor With…** and pick Archyne.

The text editor stays the default. The canvas is a second way to look at the
file, not a replacement for reading it — and edits go both ways: move a node
and the file is rewritten, type in a text editor open on the same file and the
canvas redraws.

Seven diagram families can be edited on the canvas: flowchart, sequence, class,
state, entity-relationship, C4 and `architecture-beta`. Anything else Mermaid
can draw opens read-only, rendered rather than refused.

## Saving is VS Code's

While VS Code owns the file, Archyne stands aside from it: no Save, no Save
as…, no Open, no Reload from disk, no New diagram, and no document tabs of its
own. <kbd>Ctrl</kbd>+<kbd>S</kbd> and <kbd>Ctrl</kbd>+<kbd>O</kbd> reach VS
Code rather than being intercepted, and nothing is kept in the extension's own
storage.

Everything that edits the diagram is still here — templates, import, export,
the canvas, the Mermaid source panel — because VS Code saves whatever comes
out of them.

## Known limitations

- **Archyne is alpha, and this carries it.** The accessibility report is
  self-assessed, the translations have not been reviewed by native speakers,
  and there has been no independent security review.
- **The canvas's undo history is its own.** Closing the editor tab and
  reopening it re-reads the file, as it should, but the canvas does not
  restore its undo stack — that one is not VS Code's. <kbd>Ctrl</kbd>+<kbd>Z</kbd>
  in the text editor is unaffected.

## Elsewhere

Archyne also runs as a [web app](https://dariodd.github.io/archyne/), a desktop
application, `npx archyne`, and an MCP server for agents. Source, issues and
the full changelog are at
[github.com/dariodd/archyne](https://github.com/dariodd/archyne).

MIT licensed.
