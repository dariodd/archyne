# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's **Report a vulnerability** button, under this
repository's [_Security_ tab](https://github.com/dariodd/archyne/security/advisories/new).
That opens a private advisory visible only to you and the maintainers: it is
the only channel we ask you to use, so that a report never sits in a public
issue while a fix is being written.

We deliberately publish no email address. A private advisory is tracked, gives
you a thread to reply in, and lets us credit you and publish the advisory with
a CVE when the fix ships — none of which an inbox does.

Please include:

- affected version or commit
- how the issue is reproduced
- what an attacker gains
- any proof-of-concept diagram or host page

You will get an acknowledgement within **5 working days** and a decision on
the report within **15 working days**. We ask for a **90-day** disclosure
window, or until a fix ships if that comes sooner. Reporters are credited in
the changelog unless they prefer otherwise.

## Supported versions

Archyne is pre-1.0. Only the latest release receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Threat model

Archyne has **no backend**. The web build is static files, the desktop app is
that same build in an Electron window, and diagrams live in the user's own
files or `localStorage`. There is no account system, no telemetry, and no
network call to an Archyne-operated service. That removes most of the usual
web-application attack surface, and it means a compromise of an Archyne
deployment cannot expose other users' diagrams — there is no shared store.

What remains in scope:

### Untrusted diagram source

Diagram text is parsed with Mermaid's own parser and rendered to the canvas.
Reports are in scope where crafted Mermaid input causes script execution,
reads data outside the diagram, or escapes the renderer.

### The embed bridge

`src/embed.ts` exposes a `postMessage` API for host pages (`?embed=1`). It is
**default-deny**: without an explicit `origin` parameter the bridge refuses to
talk to the parent frame. Reports are in scope where the origin allowlist can
be bypassed, or where an unauthorised origin can read diagram content.

Embedders should always pin the origin:

```
https://archyne.example/?embed=1&origin=https://your.app
```

`origin=*` disables the check and is intended for local development only.

### The MCP server

`mcp/server.ts` gives an LLM agent read/write access to `.mmd` files under
`GRAPH_DIR`. Path traversal outside that root is refused, and invalid Mermaid
is rejected before anything touches disk. Reports are in scope where either
control can be bypassed.

Note that the MCP server is, by design, a tool that writes files on behalf of
an agent. Grant it a `GRAPH_DIR` you are comfortable with it modifying.

### The desktop shell

The Electron window runs with `contextIsolation: true`, `nodeIntegration:
false` and `sandbox: true`, and external links are handed to the system
browser rather than opened in-app. Reports are in scope where renderer content
reaches Node APIs or the shell.

### The VS Code extension

`extensions/vscode` runs the same static build inside a webview and speaks the
embed protocol to the extension host, which writes the result back to the
`TextDocument` VS Code already has open. The extension never touches the disk
itself, and the webview is restricted to the extension's own directory
(`localResourceRoots`) under the app's Content-Security-Policy, rewritten so
that `'self'` names the webview's resource origin.

Reports are in scope where diagram content reaches the extension host as
anything other than text, where the webview can read outside that directory,
or where an edit is applied to a document other than the one being viewed.

## Out of scope

- Vulnerabilities in dependencies with no exploitable path in Archyne (report
  those upstream; we track them via Dependabot)
- Findings that require the user to paste attacker-supplied code into a
  browser console
- Missing hardening headers on a _self-hosted_ deployment — the operator owns
  those; see the deployment notes in `CONTRIBUTING.md`
