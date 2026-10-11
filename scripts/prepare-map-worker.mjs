import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const worker = require.resolve('maplibre-gl/dist/maplibre-gl-csp-worker.js');
const directory = new URL('../public/vendor/maplibre/', import.meta.url);
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(worker, new URL('maplibre-gl-csp-worker.js', directory));
fs.copyFileSync(require.resolve('maplibre-gl/LICENSE.txt'), new URL('LICENSE.txt', directory));
