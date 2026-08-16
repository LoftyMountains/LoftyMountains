import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const configuredBasePath = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base: configuredBasePath.endsWith("/") ? configuredBasePath : `${configuredBasePath}/`,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("recharts") || id.includes("victory-vendor")) return "market-charts";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
        },
      },
    },
  },
});
