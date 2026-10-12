import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Review hold: omit legacy manifests, maps, models and other dashboard assets.
  // The original public/ assets remain in the repository for an approved restoration.
  publicDir: false,
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "next/dynamic": fileURLToPath(new URL("./src/compat/dynamic.tsx", import.meta.url)),
    "next/link": fileURLToPath(new URL("./src/compat/link.tsx", import.meta.url)),
  } },
  server: { host: "0.0.0.0", port: 5173, proxy: { "/api": process.env.VITE_DEV_API_TARGET || "http://[::1]:8787" } },
  worker: { format: "es" },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", sourcemap: false },
});
