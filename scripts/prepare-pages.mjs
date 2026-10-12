import { copyFile, mkdir } from 'node:fs/promises';
// Preserve the existing Pages domain while the review build omits public assets.
await copyFile(new URL('../public/CNAME', import.meta.url), new URL('../dist/CNAME', import.meta.url));
await copyFile(new URL('../dist/index.html', import.meta.url), new URL('../dist/404.html', import.meta.url));
for (const route of ['docs', 'privacy']) {
  const directory = new URL(`../dist/${route}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await copyFile(new URL('../dist/index.html', import.meta.url), new URL('index.html', directory));
}
