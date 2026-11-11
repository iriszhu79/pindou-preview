import { defineConfig } from "vite";
export default defineConfig({
  base: "/pindou-preview/",
  build: { outDir: "dist-preview" },
  server: { host: "0.0.0.0", port: 4300 },
  preview: { host: "0.0.0.0", port: 4301 },
});
