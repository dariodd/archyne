# Repository setup

Things that live in GitHub settings rather than in the codebase. Nothing here
can be committed, so it is written down instead — a policy that points at a
button nobody pressed is worse than no policy.

Ordered by how much each one blocks.

## 1. Before the repository is public

- [ ] **Replace `OWNER` with the GitHub account or organisation name.** It
      appears in `package.json` (`repository`, `bugs`, `homepage`), in
      `README.md` (badges, demo link) and in the two policy files. One command
      does all of them:
      `git grep -l OWNER -- . ':!docs/repo-setup.md' | xargs sed -i 's|OWNER|your-github-user|g'`
      — then confirm with `npm pkg get repository homepage`, and check that
      `git grep OWNER` returns only this file.

- [ ] **Enable Private Vulnerability Reporting.**
      _Settings → Code security → Private vulnerability reporting → Enable._
      `SECURITY.md` and `CODE_OF_CONDUCT.md` both send reporters to
      `/security/advisories/new`. Until this is on, that URL 404s and the
      disclosure policy is a dead link — which reads worse than having no
      policy at all.

- [ ] **Turn on Dependabot alerts and security updates.**
      _Settings → Code security._ `.github/dependabot.yml` already configures
      the version-update PRs; the alerts are a separate switch.

- [ ] **Protect `main`.** Require a pull request, and require the `verify`,
      `e2e` and `windows` checks from `.github/workflows/ci.yml` to pass.
      A CI suite that can be bypassed by pushing to `main` is decoration.

## 2. To publish the demo

- [ ] **Settings → Pages → Source: GitHub Actions.**
      `.github/workflows/pages.yml` then publishes every push to `main` to
      `https://<owner>.github.io/archyne/`. `vite.config.ts` uses
      `base: "./"`, so no path configuration is needed.

## 3. To publish to npm

- [ ] **Check the name is free:** `npm view archyne`. If it is taken, publish
      under a scope (`@your-org/archyne`) and update `package.json` — the
      `bin` name can stay `archyne` either way.

- [ ] **Add the `NPM_TOKEN` secret** (an npm _automation_ token), or configure
      npm Trusted Publishing for this repository, which removes the token
      entirely. Trusted Publishing is preferable: nothing long-lived to leak.

- [ ] Publishing runs from `.github/workflows/release.yml` on a `v*` tag, with
      `--provenance`. Provenance requires the package to be public and the job
      to have `id-token: write`; both are already set.

## 4. To ship signed desktop builds

This is the one item that costs money, and it is the reason the desktop
artifacts in `release.yml` are marked "testing only".

- [ ] **Windows:** an OV or EV code-signing certificate. EV clears SmartScreen
      immediately; OV builds reputation over time, so an OV-signed installer
      may still warn for weeks. Export as base64 into `CSC_LINK`, with
      `CSC_KEY_PASSWORD`.

- [ ] **macOS:** an Apple Developer Program membership ($99/yr) for a
      "Developer ID Application" certificate, plus notarisation credentials
      (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
      `hardenedRuntime` is already enabled in `electron-builder.yml`.
      Without notarisation, macOS refuses to open the app at all — not a
      warning, a refusal.

- [ ] **Linux:** AppImage and `.deb` need no signing to run.

Once signing works, remove the "unsigned" note from `.github/workflows/release.yml`
and from `electron-builder.yml`, and link the installers from the README.

## 5. Nice to have

- [ ] A repository description and topics (`mermaid`, `diagrams`,
      `local-first`, `mcp`) — this is most of how the project is found.
- [ ] Social preview image (_Settings → General → Social preview_);
      `docs/images/editor-flowchart-light.png` works.
- [ ] Enable Discussions if you want a question channel that is not the issue
      tracker.
