## Downloads

| Platform | File                                                                  |
| -------- | --------------------------------------------------------------------- |
| Windows  | `Archyne-Setup-<version>.exe`                                         |
| macOS    | `Archyne-<version>-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel)   |
| Linux    | `Archyne-<version>-x86_64.AppImage`, or `Archyne-<version>-amd64.deb` |

Or run it without installing anything:

```sh
npx archyne
```

The web version needs no download at all: <https://dariodd.github.io/archyne/>

### These installers are not code-signed

Stated up front rather than discovered at the download prompt:

- **Windows** — SmartScreen will warn that the publisher is unknown. Choose
  _More info → Run anyway_.
- **macOS** — macOS will say it cannot verify the developer. Drag the app to
  Applications, then right-click it and choose _Open_; on macOS 15 and newer,
  approve it under _System Settings → Privacy & Security → Open Anyway_.
- **Linux** — no signing is involved; AppImage and `.deb` install normally.

Signing needs a purchased Windows certificate and an Apple Developer
membership. Until those exist, the honest options are the web version, `npx
archyne`, or accepting the warnings above.

Everything runs locally either way — no server, no accounts, and no network
requests of Archyne's own. See the
[security policy](https://github.com/dariodd/archyne/blob/main/SECURITY.md)
for the threat model.

<!-- Absolute, not relative. This file is pasted into a GitHub Release body,
     where a relative link resolves against the release page rather than the
     repository root — `../blob/main/SECURITY.md` became a 404 under
     /releases/. Nothing here can assume it is being read from its own
     directory. -->

---
