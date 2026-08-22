/**
 * Give the macOS build a signature that is at least *valid*.
 *
 * electron-builder signs a mac app only when it can find a certificate. In CI
 * there is none, so it logs `skipped macOS application code signing, reason=
 * cannot find valid identity` and ships the bundle exactly as it was packed —
 * carrying nothing but the ad-hoc signature the Electron binary arrives with
 * from the linker. That is not the same as "unsigned":
 *
 *     Identifier=Electron                  ← not dev.archyne.app
 *     flags=0x20002(adhoc,linker-signed)
 *     Info.plist=not bound
 *     Sealed Resources=none
 *
 *     $ codesign --verify --deep --strict Archyne.app
 *     Archyne.app: code has no resources but signature indicates they must
 *                  be present
 *
 * The signature claims a resource envelope that the bundle does not have, so
 * it does not merely fail to establish who built the app — it fails to verify
 * at all. Gatekeeper reports that as **"Archyne is damaged and can't be
 * opened. You should move it to the Trash."**, and on Apple Silicon there is
 * no way past it: `xattr -dr com.apple.quarantine` removes the quarantine
 * flag, which is a different thing from repairing the signature, and the
 * release notes used to offer it as though it were the fix. Every macOS
 * download up to and including v0.5.0-alpha.1 was unopenable.
 *
 * Signing ad-hoc costs nothing and needs no certificate. It still cannot say
 * *who* built the app — users get the unidentified-developer prompt, and that
 * is the honest state of things until there is an Apple Developer membership
 * — but the bundle verifies, which is the difference between a warning a user
 * can accept and a refusal they cannot.
 *
 * Runs unconditionally on darwin, before electron-builder's own signing step.
 * When a real certificate *is* configured, electron-builder signs afterwards
 * and its signature replaces this one, which is the intended outcome.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTITLEMENTS = join(root, "build", "entitlements.mac.plist");

/** @param {import("electron-builder").AfterPackContext} context */
export default async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  // `--deep` is deprecated by Apple in favour of signing inside-out, and the
  // deprecation is aimed at real distribution signing, where it silently
  // applies the wrong entitlements to nested helpers. For an ad-hoc identity
  // there are no entitlements worth getting wrong beyond the ones below, and
  // the alternative is reimplementing electron-builder's traversal of
  // Frameworks/, Helpers/ and every nested .app by hand.
  //
  // `--force` is required: there is already a signature here — the linker's —
  // and codesign refuses to replace one without being told to.
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-", // ad-hoc
      "--options",
      "runtime", // matches hardenedRuntime in electron-builder.yml
      "--entitlements",
      ENTITLEMENTS,
      app,
    ],
    { stdio: "inherit" },
  );

  // Verify rather than trust. A signature that does not verify is precisely
  // the bug this file exists to prevent, and a build that ships one again
  // should fail here rather than on a user's Mac.
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });

  console.log(`  • ad-hoc signed and verified  ${app}`);
}
