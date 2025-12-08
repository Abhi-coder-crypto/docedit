import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isReplit = process.env.REPL_ID !== undefined;
const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isReplit && isDev
      ? [
          (async () => {
            try {
              const mod = await import("@replit/vite-plugin-runtime-error-modal");
              return mod.default();
            } catch {
              return null;
            }
          })(),
          (async () => {
            try {
              const mod = await import("@replit/vite-plugin-cartographer");
              return mod.cartographer();
            } catch {
              return null;
            }
          })(),
          (async () => {
            try {
              const mod = await import("@replit/vite-plugin-dev-banner");
              return mod.devBanner();
            } catch {
              return null;
            }
          })(),
        ]
      : []),
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
