# Archyne — security architecture

A document for the people who have to approve a tool, not just install it.
It states what Archyne does with data, what it is exposed to, and what has
actually been verified rather than assumed.

`SECURITY.md` is the disclosure policy and the definition of what is in scope
for a report. This is the reasoning behind it.

**Version:** covers Archyne 0.1.x.
**Last reviewed:** 2026-08-01.

---

## 1. The short version

Archyne has no backend. There is no account system, no database, no telemetry,
and no network call to any service the project operates. The web application
is a folder of static files; the desktop application is the same folder inside
an Electron window. Diagrams live in the user's own files and in
`localStorage`.

This is not a privacy posture bolted on afterwards — it is the shape of the
product. The consequences that matter to a reviewer:

- **There is no shared store to breach.** Compromising a deployment cannot
  expose another user's diagrams, because a deployment holds none.
- **There is no data processor relationship.** Archyne never receives customer
  content, so it cannot lose it, subpoena it, or train on it.
- **`connect-src 'self'` states a real invariant.** Everything the app needs,
  including Mermaid's renderers and roughly 13 000 vendor icons, is bundled.
  A connection attempt to anywhere else is a bug, and the Content Security
  Policy turns it into a visible failure rather than a silent exfiltration.

The surface that remains is the surface of _rendering untrusted text_, and of
the three optional integration points: the embed bridge, the MCP server and
the desktop shell. Sections 3–7 take them one at a time.

## 2. Where data goes

| Data                                      | Where it lives                                                              | Leaves the machine?                  |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| Diagram source (`.mmd`)                   | The user's filesystem, via File System Access API or the desktop IPC bridge | No                                   |
| Unsaved working copy                      | `localStorage`, key `graph:code`                                            | No                                   |
| Preferences (theme, locale, icon history) | `localStorage`                                                              | No                                   |
| Exported PNG/SVG                          | Generated in-page as a data URL, then downloaded                            | No                                   |
| Share links (`?code=`)                    | The URL the user chooses to send                                            | Only if the user sends it            |
| Diagrams in embed mode                    | Held by the host page; Archyne writes nothing to `localStorage`             | Only to origins the host allowlisted |

Two of these deserve emphasis because they are the only ways diagram content
moves at all, and both are user-initiated:

- **`?code=` share links** put the whole diagram in the URL. That is
  convenient and it is also a disclosure channel: URLs end up in browser
  history, proxy logs, chat previews and referrer headers. A link is as
  sensitive as the diagram in it.
- **Embed mode** hands content to a host page over `postMessage`. See §5.

## 3. Rendering untrusted diagram text

This is the primary attack surface, and the one most worth a reviewer's
attention, because diagram text is genuinely untrusted input: it arrives from
a `?code=` link someone was sent, from a `.mmd` file, or from the embed
bridge, and the rendered SVG is written into the DOM.

### 3.1 Two independent layers

**Layer 1 — Mermaid's sanitizer.** Archyne initialises Mermaid with
`securityLevel: "strict"` (`src/model/fromMermaid.ts`).

It is worth being precise about what that buys, because the obvious answer is
wrong. Mermaid runs DOMPurify over every diagram _label_ at every security
level, `loose` included — so label sanitizing is not what `strict` provides.
The code path that actually branches on the level is `utils.formatUrl`, which
calls `sanitizeUrl` only outside `loose`. Under `loose`, a diagram containing

```
click node href "javascript:…"
```

places that URL verbatim into the rendered anchor. We measured it: the script
executes on click. Under `strict` it becomes `about:blank`.

`securityLevel` is on Mermaid's `secure` configuration list, so a `%%{init}%%`
directive inside a diagram cannot downgrade it. Mermaid's other
level-dependent feature, `click … call fn()`, is inert here regardless:
binding it requires calling Mermaid's `bindFunctions`, which Archyne never
does.

**Layer 2 — Content Security Policy.** `index.html` ships:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';
worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'
```

No `unsafe-inline` and no `unsafe-eval` for scripts. The two loosenings are
deliberate and narrow: `style-src 'unsafe-inline'` because Mermaid injects a
`<style>` element per render, and `img-src`/`font-src` `data:` because the
export pipeline rasterises through data URLs.

`frame-ancestors` is absent because it is ignored in a `<meta>` tag and
because Archyne supports being embedded. **Operators who need to restrict who
may frame their deployment must send it as an HTTP header.** So must anyone
who wants the CSP to survive a proxy that rewrites markup — a `<meta>` policy
is the floor, not a guarantee, which is exactly why layer 1 has to hold on its
own.

### 3.2 What is verified, and how

`tests/e2e-csp.mts` drives a real browser and checks both layers separately.
Layer 1 is checked with the CSP deliberately bypassed, so a sanitizer
regression cannot hide behind the policy.

The load-bearing assertion is the `click … href` one, for the reason above: a
label-only test passes identically under `loose` and proves nothing. **The
acceptance criterion for that suite is that flipping `securityLevel` to
`"loose"` makes it fail.** Every assertion is paired with a positive control,
so nothing passes because the diagram failed to render.

The suite runs in CI on every pull request, against the production build.

## 4. Dependencies and supply chain

- **SBOM.** `npm run sbom` emits CycloneDX 1.5 covering the production tree,
  read from `package-lock.json` rather than a subprocess, so it is
  deterministic and works offline.
- **Licence drift.** `npm run notices:check` fails the build when a direct
  dependency or a licence type in the tree is missing from
  `THIRD-PARTY-NOTICES.md`, so the notices cannot quietly go stale.
- **Advisory gate.** `npm run audit` (`scripts/audit-gate.mjs`) fails CI on
  high or critical advisories in _production_ dependencies. Exceptions live in
  `audit-allow.json` and require a written reason and an expiry date; an
  expired exception fails the build. The dev tree is excluded deliberately —
  Electron and the toolchain never reach a user, and gating on them trains
  people to ignore the gate.
- **Provenance.** Releases publish with `npm publish --provenance` from a
  tagged commit, producing a signed, publicly verifiable link between the
  tarball, the workflow and the source commit.
- **Dependabot** is configured for both npm and GitHub Actions.

Archyne bundles rather than fetches: Mermaid's renderers and the Iconify icon
collections ship in the build. That is why `connect-src 'self'` is honest, and
it also means no CDN is in the trust path at runtime.

## 5. The embed bridge

`src/embed.ts` exposes a `postMessage` API to a host page when the app is
loaded with `?embed=1`.

It is **default-deny**. Without an explicit `origin` parameter the bridge
refuses to talk to the parent frame at all, and diagram content is only ever
posted to an origin on the allowlist:

```
https://archyne.example/?embed=1&origin=https://your.app
```

`origin=*` disables the check, logs a warning, and is for local development.

In embed mode Archyne writes nothing to `localStorage` — the host owns the
data, and closing the frame leaves nothing behind.

This was a real defect once: the default was `"*"`, so an embedded editor
answered any window and posted diagram content to any origin. It is now
covered by tests.

## 6. The MCP server

`mcp/server.ts` gives an LLM agent read/write access to `.mmd` files under
`GRAPH_DIR` over stdio. It is not exposed over the network.

Two controls:

- **Path containment.** Resolved paths must stay under the root; traversal is
  refused. Exercised by `npm run mcp:smoke`.
- **Validation before write.** Invalid Mermaid is rejected before anything
  touches disk, so an agent cannot leave a corrupted file behind.

The honest caveat: this is, by design, a tool that writes files on an agent's
behalf. `GRAPH_DIR` should be a directory you are comfortable with it
modifying. Archyne cannot make an agent's judgement safe; it can only bound
where the agent can act.

## 7. The desktop shell

The Electron window (`desktop/main.cjs`) runs with `contextIsolation: true`,
`nodeIntegration: false` and `sandbox: true`. The renderer reaches the
filesystem only through a narrow preload bridge (`desktop/preload.cjs`) that
exposes named operations, never Node APIs. External links are handed to the
system browser rather than opened in-app.

File handoff goes through IPC, not a URL query string. The earlier approach
broke on large diagrams and discarded the file path, so open-then-save could
not round-trip.

**Current limitation:** desktop builds are **not code-signed**. Windows
SmartScreen warns on the installer and macOS Gatekeeper refuses to open it.
This is tracked in `docs/repo-setup.md` and is a procurement blocker for
desktop distribution — it is stated here rather than omitted.

## 8. Known gaps

Listed because a security document that claims no gaps is not credible.

- **No independent penetration test or third-party audit.** All verification
  to date is the project's own automated suites.
- **Desktop builds are unsigned** (§7).
- **No SOC 2, and no DPA on offer.** There is no processing to cover, but for
  buyers whose process requires the paperwork regardless, the paperwork does
  not exist.
- **No formal accessibility conformance sign-off** beyond the automated
  evidence in `docs/accessibility-conformance-report.md`, which is explicit
  about what has and has not been tested.
- **No security headers are shipped for self-hosters** beyond the `<meta>`
  CSP — `frame-ancestors`, HSTS and the rest belong to whoever serves the
  files, and the deployment notes say so.
- **`?code=` share links carry diagram content in the URL** (§2). This is
  inherent to the feature, not a defect, but it is a disclosure channel worth
  naming in a policy.

## 9. Reporting

See [`SECURITY.md`](../SECURITY.md). Reports go through GitHub's private
vulnerability reporting; acknowledgement within 5 working days, a decision
within 15, and a 90-day disclosure window or until a fix ships.
