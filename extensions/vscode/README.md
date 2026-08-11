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

Then open the **repository root** in VS Code and press <kbd>F5</kbd>. That runs
the _Run the VS Code extension_ configuration in `.vscode/launch.json`, which
rebuilds the extension and opens a second window with it loaded. Nothing is
installed: close the window and it is gone.

To install it into your own VS Code instead, `npm run package` produces a
`.vsix`, which `code --install-extension archyne.vsix` installs and
`code --uninstall-extension naxeris.archyne` removes.

## Publishing it

From CI, not from a laptop: `.github/workflows/publish-extension.yml`, either
by running it from the Actions tab — with a **dry run** option that packages
without publishing — or by pushing an `ext-v*` tag.

It is a separate workflow from `release.yml` on purpose. That one triggers on
`v*`, which matches `vscode-v1.0.0` as readily as `v0.3.0`, so an extension tag
beginning with `v` would fire the npm release and republish whatever the root
manifest reads. `ext-v*` cannot be matched by it. They also fail differently: a
rejected listing should not strand a half-finished npm release.

It needs a `VSCE_PAT` secret on the repository — a PAT from Azure DevOps with
**All accessible organizations** and the **Marketplace → Manage** scope, from
an account that is a member of the `naxeris` publisher. Whichever account
issues the token must be listed under **Members** on the publisher; being in
the Azure DevOps organization is not the same permission and is not enough.

## Its version

There is one number to bump, and it is not this one: the extension follows the
app's version in the repository root's `package.json`. `npm run build` syncs
it, `npm run version:check` fails when the two have drifted, and CI runs that
check on every push, so a release that bumps the app and forgets the extension
does not get out.

The prerelease suffix is dropped along the way — `0.3.0-alpha.1` here becomes
`0.3.0` — because the Marketplace refuses a version with one, and `vsce
publish` says so at the last step, after `vsce package` has cheerfully built
it. What carries that meaning instead is the `--pre-release` flag, which is
how VS Code expresses the same thing.

## What Archyne hides in here

Saving, opening and the multi-document workspace belong to VS Code while it
owns the file, so Archyne withdraws its own: Save, Save as…, Open, Reload from
disk, New diagram, Rename, Duplicate and the document tab strip. <kbd>Ctrl</kbd>+<kbd>S</kbd>
and <kbd>Ctrl</kbd>+<kbd>O</kbd> pass through to VS Code rather than being
intercepted.

Everything that edits the diagram stays — templates, import, export, the
canvas, the source panel — because VS Code is saving whatever comes out of
them.

Nothing is kept in the webview's own storage either: the file is VS Code's,
and Archyne holds its splash until the document arrives rather than drawing
one of its own first.

## Tests

The rewrite that makes the page loadable in a webview is the piece most likely
to break silently — a tightened directive in the app's `index.html` shows up
as a blank panel and nothing worth reading in the log — so it lives in
`src/rewrite.ts`, which imports nothing, and is covered by
`src/rewrite.test.ts` under the repository's own runner (`npm test` at the
root). It is checked against the real `index.html` rather than a fixture,
which is the point: a fixture would keep passing after the page changed.

## What is not done yet

- **No marketplace listing.** The publisher (`naxeris`) exists; the extension
  has never been published under it, and the release workflow does not publish
  it.
