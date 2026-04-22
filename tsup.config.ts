import { defineConfig } from "tsup";

export default defineConfig([
  // Main library bundle (both ESM and CJS)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: "dist",
  },
  // CLI bundle (ESM only since we have top-level await)
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: "dist",
  },
]);
