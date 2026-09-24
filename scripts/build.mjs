import { mkdir, readdir, cp, rm, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
// Publish only public site assets, never server code, accounts, or local recovery files.
for (const file of await readdir('.')) {
  if (/\.(html|css|js)$/.test(file)) await cp(file, `dist/${file}`);
}
for (const dir of ['assets', 'data']) await cp(dir, `dist/${dir}`, { recursive: true });

// Live event content comes from Blobs; never publish local preview uploads.
await writeFile('dist/data/event-info.json', JSON.stringify({ events: [] }));
