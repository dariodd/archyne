/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The version, read from the manifest that already holds it.
 *
 * The About dialog used to carry its own copy, which meant the number was
 * right until the first release nobody thought to update it for — it said
 * 0.1.0 through two of them. A build-time constant cannot go stale: there is
 * one number, in the file the release process already bumps.
 */
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

export default defineConfig({
  // Relative base so the build also works from file:// (Electron shell).
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Installs a complete localStorage and empties it between tests; see the
    // file for why jsdom's own is not enough here.
    setupFiles: ["./src/test-setup.ts"],
    // Vitest's default is 5s, which the tests that go through mermaid's own
    // parser exceed under the load of the whole suite running at once — a
    // different three or four of them each run, on timing rather than on
    // anything they assert. They pass in isolation and they pass here; a
    // timeout is meant to catch a hang, not to race a parser.
    testTimeout: 20_000,
  },
});
