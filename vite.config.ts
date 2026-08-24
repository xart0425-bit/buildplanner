import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    // This project lives on a mapped/network drive (Z:), where Windows fs.watch throws
    // `UNKNOWN: watch` and takes the dev server down. Polling is slower but is the only
    // watcher that works reliably off a local disk.
    watch: {
      usePolling: true,
      interval: 300,
    },
    // Dead configuration in this project: Vite runs in middleware mode behind Express and
    // server/_core/vite.ts passes `allowedHosts: true`, which replaces this whole block.
    // Editing this list has no effect — change setupVite() instead.
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

