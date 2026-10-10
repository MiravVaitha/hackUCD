// Copies the barcode reader's WebAssembly file into public/vendor so the
// packing station loads it from this site instead of a third-party CDN.
// Runs after install (locally and on Vercel).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

try {
  // zxing-wasm is a dependency of barcode-detector, so resolve it from there.
  const detectorEntry = require.resolve("barcode-detector");
  const readerEntry = require.resolve("zxing-wasm/reader", { paths: [detectorEntry] });
  const distDir = readerEntry.slice(0, readerEntry.lastIndexOf(`${path.sep}dist${path.sep}`) + 5);
  const source = path.join(distDir, "reader", "zxing_reader.wasm");
  if (!existsSync(source)) throw new Error(`not found at ${source}`);

  const targetDir = path.join(root, "public", "vendor");
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, path.join(targetDir, "zxing_reader.wasm"));
  console.log("[copy-wasm] Barcode reader copied to public/vendor/zxing_reader.wasm");
} catch (error) {
  // Do not fail the install: the packing station falls back to the CDN copy.
  console.warn("[copy-wasm] Skipped:", error instanceof Error ? error.message : error);
}
