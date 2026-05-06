#!/usr/bin/env node
// CLI entry shim. Its only job is to suppress Node's SQLite "experimental
// feature" warning before any module that imports node:sqlite is loaded —
// ESM hoists static imports above all top-level code, so the actual logic
// must live behind a dynamic import.
process.removeAllListeners("warning");
process.on("warning", (w: Error) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  process.stderr.write(`(node) ${w.name}: ${w.message}\n`);
});

await import("./main.ts");
