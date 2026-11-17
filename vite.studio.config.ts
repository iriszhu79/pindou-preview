import { defineConfig } from "vite";
export default defineConfig({
  root: "studio",
  base: "./",
  build: { outDir: "../dist-studio", emptyOutDir: true },
  server: { host: "0.0.0.0", port: 4310 },
  preview: { host: "0.0.0.0", port: 4311 },
});
