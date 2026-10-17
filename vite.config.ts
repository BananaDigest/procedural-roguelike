import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works on itch.io / GitHub Pages subpaths.
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
