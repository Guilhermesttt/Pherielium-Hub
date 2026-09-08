import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import path from "path";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    // Usa terser para minificação avançada em produção, incluindo remoção de
    // console.* e debugger sem o risco de quebrar strings com regex.
    minify: "terser",
    terserOptions: {
      compress: {
        // Remove console.* e debugger do bundle de produção
        drop_console: true,
        drop_debugger: true,
        // Otimizações extras de compressão
        passes: 2,
        pure_funcs: ["console.log", "console.debug", "console.info"],
      },
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        overlay: path.resolve(__dirname, "overlay.html"),
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase")) {
              return "supabase-vendor";
            }
            if (
              id.includes("framer-motion") ||
              id.includes("lucide-react") ||
              id.includes("@radix-ui")
            ) {
              return "ui-vendor";
            }
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/release/**", "**/dist/**", "**/.git/**"],
    },
    proxy: {
      "/api": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
  preview: {
    proxy: {
      "/api": "http://localhost:8787",
      "/auth": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
});
