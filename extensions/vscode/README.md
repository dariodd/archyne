# Archyne for VS Code

Draw Mermaid diagrams on a canvas, in the editor that already has the file
open. The diagram stays an ordinary `.mmd` file: VS Code owns it, so the dirty
dot, undo, save and the diff against `HEAD` all behave exactly as they do for
the text.

## Using it

Open a `.mmd` or `.mermaid` file and run **Archyne: Open in Archyne** from the
command palette, or use **Reopen Editor With…** and pick Archyne. The text
editor stays the default — the canvas is a second way to look at the file, not
a replacement for reading it.

Edits go both ways. Moving a node rewrites the file; typing in a text editor
open on the same file redraws the canvas.

## Building it

The extension ships the editor rather than building it, so the app has to be
built first, from the repository root:

```sh
npm install && npm run build     # repository root — produces dist/
cd extensions/vscode
npm install
npm run build                    # copies dist/ into media/app/, compiles src/
```

Then press <kbd>F5</kbd> in VS Code to launch an Extension Development Host
with it loaded.

`npm run package` produces a `.vsix`.

## What is not done yet

- The app's own **Save** and **Open** controls are still on the toolbar inside
  the webview. In here they are the wrong controls — VS Code saves the
  document — and they will be hidden.
- **No icon, no marketplace listing.** This has not been published.
- The webview loads whatever document the app had in its own storage before
  the file arrives, which can show for a frame.
