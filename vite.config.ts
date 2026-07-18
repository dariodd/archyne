/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build also works from file:// (Electron shell).
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
