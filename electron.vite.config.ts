import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "main" && mode !== "preload") {
    throw new Error('Electron build mode must be either "main" or "preload".');
  }

  return {
    build: {
      emptyOutDir: mode === "main",
      lib: {
        entry: fileURLToPath(new URL(`electron/${mode}.ts`, import.meta.url)),
        formats: ["cjs"]
      },
      minify: false,
      outDir: fileURLToPath(new URL("dist-electron", import.meta.url)),
      rollupOptions: {
        external: (moduleId) => moduleId === "electron" || moduleId.startsWith("node:"),
        output: {
          entryFileNames: `${mode}.cjs`
        }
      },
      sourcemap: true,
      target: "node22"
    },
    root: projectRoot
  };
});
