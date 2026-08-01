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
  },
});
