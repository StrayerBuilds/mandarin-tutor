/**
 * Copies the onnxruntime-web runtime (wasm + esm loader) into public/ort/ so the
 * speech recogniser can run fully offline instead of pulling its runtime from a CDN
 * on every visit.
 *
 * Runs automatically before `npm run dev` and `npm run build`.
 */
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const candidates = [
  path.join(root, 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(root, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
];

const dist = candidates.find((p) => existsSync(p));

if (!dist) {
  console.error(
    '\n[copy-ort] Could not find onnxruntime-web/dist.\n' +
      'Run `npm install` first. Searched:\n' +
      candidates.map((c) => '  - ' + c).join('\n') +
      '\n',
  );
  process.exit(1);
}

const out = path.join(root, 'public', 'ort');
await mkdir(out, { recursive: true });

const entries = await readdir(dist);
const wanted = entries.filter((f) => /\.(wasm|mjs)$/.test(f) && !f.endsWith('.map'));

if (wanted.length === 0) {
  console.error(`[copy-ort] No .wasm/.mjs files found in ${dist}`);
  process.exit(1);
}

let bytes = 0;
for (const f of wanted) {
  const src = path.join(dist, f);
  await copyFile(src, path.join(out, f));
  bytes += (await stat(src)).size;
}

console.log(
  `[copy-ort] ${wanted.length} runtime files -> public/ort/ (${(bytes / 1e6).toFixed(1)} MB)`,
);
