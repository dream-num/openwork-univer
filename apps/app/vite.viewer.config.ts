import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const coworkViewerEntry = createRequire(import.meta.url).resolve(
  "@univerjs-pro/cowork/viewer",
);

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    target: "esnext",
    outDir: resolve(appRoot, "dist", "assets"),
    emptyOutDir: false,
    lib: {
      entry: coworkViewerEntry,
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "viewer.js",
        chunkFileNames: "viewer-[name]-[hash].js",
        assetFileNames: "viewer-[name]-[hash][extname]",
      },
    },
  },
});
