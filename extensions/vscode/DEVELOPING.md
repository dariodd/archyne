# Working on the VS Code extension

Notes for whoever builds, tests or publishes this. None of it belongs in
`README.md`, which is the body of the Marketplace and Open VSX listing pages
and is read by people who only want to install the thing.

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

## How it hangs together

A `CustomTextEditorProvider` at `priority: "option"`, so a `.mmd` still opens
as text unless asked otherwise, and VS Code keeps owning the document — the
dirty state, undo, save and the diff against `HEAD` are all its. The extension
never touches the disk.

The webview runs the same bundle as the web and desktop apps, copied into
`media/app/` at build time. Two things have to be rewritten for it to load
there, and `src/rewrite.ts` does both: a `<base>` so relative asset URLs
resolve through `asWebviewUri`, and the page's own CSP with `'self'` swapped
for the webview's source. That includes widening `base-uri 'none'`, which is
correct over HTTP and is exactly what would stop the `<base>` working here.

The bridge between the two is the embed protocol (`src/embed.ts` in the app),
which grew a second transport for this: a webview is the top document, so
there is no framing page to post to and `acquireVsCodeApi()` is the peer
instead.

## Tests

The rewrite is the piece most likely to break silently — a tightened directive
in the app's `index.html` shows up as a blank panel with nothing worth reading
in the log — so it lives in a module that imports nothing and is covered by
`src/rewrite.test.ts` under the repository's own runner (`npm test` at the
root). It is checked against the real `index.html` rather than a fixture,
which is the point: a fixture would keep passing after the page changed.

## Its version

There is one number to bump, and it is not this one: the extension follows the
app's version in the repository root's `package.json`. `npm run build` syncs
it, `npm run version:check` fails when the two have drifted, and CI runs that
check on every push, so a release that bumps the app and forgets the extension
does not get out.

The prerelease suffix is dropped along the way — `0.3.0-alpha.1` here becomes
`0.3.0` — because the Marketplace refuses a version carrying one, and `vsce
publish` says so at the last step, after `vsce package` has cheerfully built
it. What carries that meaning instead is the `--pre-release` flag.

Two consequences worth knowing before a release:

- **Every alpha of a version maps to the same number.** `0.3.0-alpha.2` maps
  to `0.3.0` just as `0.3.0-alpha.1` did, and a registry will not take that
  twice. Shipping a new extension version means bumping the app first.
- **A publish is final.** Neither registry moves a published version between
  channels, and `vsce unpublish` deletes _all_ versions of an extension, not
  one.

## Publishing it

From CI, not from a laptop: `.github/workflows/publish-extension.yml`, either
from the Actions tab — with a **dry run** that packages without publishing —
or by pushing an `ext-v*` tag. It publishes the same `.vsix` to the
Marketplace and to Open VSX, on one computed channel.

It is a separate workflow from `release.yml` on purpose. That one triggers on
`v*`, which matches `vscode-v1.0.0` as readily as `v0.3.0`, so an extension tag
beginning with `v` would fire the npm release and republish whatever the root
manifest reads. `ext-v*` cannot be matched by it. They also fail differently: a
rejected listing should not strand a half-finished npm release.

Two secrets:

- **`VSCE_PAT`** — a PAT from Azure DevOps with **All accessible
  organizations** and the **Marketplace → Manage** scope. Whichever account
  issues it must be listed under **Members** on the `naxeris` publisher; being
  in the Azure DevOps organization is a different permission and is not
  enough. Note that Azure DevOps retires global PATs on 1 December 2026, after
  which this has to move to Entra ID workload identity federation and
  `vsce publish --azure-credential`.
- **`OVSX_PAT`** — from <https://open-vsx.org/user-settings/tokens>, which
  needs an Eclipse account whose profile carries the right GitHub username,
  and a signed Publisher Agreement. Absent, the Open VSX step warns and is
  skipped rather than failing the run.

`0.3.0` went out by hand before this workflow existed, which is why it is a
pre-release on the Marketplace and a stable release on Open VSX. The workflow
passes one channel to both, so that does not recur.
