import { copyFile, mkdir } from 'node:fs/promises';
await copyFile(new URL('../dist/index.html', import.meta.url), new URL('../dist/404.html', import.meta.url));
for (const route of ['docs', 'privacy']) {
  const directory = new URL(`../dist/${route}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await copyFile(new URL('../dist/index.html', import.meta.url), new URL('index.html', directory));
}
