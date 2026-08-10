/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build also works from file:// (Electron shell).
  base: "./",
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
