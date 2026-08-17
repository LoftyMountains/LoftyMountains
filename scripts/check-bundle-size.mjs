import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const outputDirectory = path.resolve(process.argv[2] || "dist");
const initialBudget = 150 * 1024;
const chunkBudget = 80 * 1024;
const indexFile = path.join(outputDirectory, "index.html");

if (!fs.existsSync(indexFile)) {
  console.error(`[bundle-budget] missing ${indexFile}`);
  process.exit(1);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function assetReference(tag) {
  return tag.match(/\b(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/i)?.[1] || null;
}

function resolveAsset(reference, javascriptFiles) {
  const relativeReference = decodeURIComponent(reference.split("?")[0]).replace(/^\/+/, "");
  const directPath = path.join(outputDirectory, relativeReference);
  if (fs.existsSync(directPath)) return directPath;
  const normalizedReference = relativeReference.replaceAll("\\", "/");
  const matches = javascriptFiles.filter((file) => normalizedReference.endsWith(path.relative(outputDirectory, file).replaceAll("\\", "/")));
  if (matches.length === 1) return matches[0];
  throw new Error(`cannot resolve initial asset ${reference}`);
}

const javascriptFiles = walk(outputDirectory).filter((file) => file.endsWith(".js"));
const indexHtml = fs.readFileSync(indexFile, "utf8");
const initialReferences = Array.from(indexHtml.matchAll(/<(?:script|link)\b[^>]*>/gi))
  .map(([tag]) => assetReference(tag))
  .filter((reference) => reference !== null);
const initialFiles = new Set(initialReferences.map((reference) => resolveAsset(reference, javascriptFiles)));
const assets = javascriptFiles.map((file) => ({
  file,
  name: path.relative(outputDirectory, file).replaceAll("\\", "/"),
  gzipBytes: gzipSync(fs.readFileSync(file), { level: 9 }).byteLength,
  initial: initialFiles.has(file),
})).sort((left, right) => right.gzipBytes - left.gzipBytes);
const initialBytes = assets.filter((asset) => asset.initial).reduce((total, asset) => total + asset.gzipBytes, 0);
const oversizedAssets = assets.filter((asset) => asset.gzipBytes > chunkBudget);

for (const asset of assets) {
  console.log(`${asset.initial ? "initial" : "async  "} ${(asset.gzipBytes / 1024).toFixed(2).padStart(7)}KB  ${asset.name}`);
}
console.log(`[bundle-budget] initial ${(initialBytes / 1024).toFixed(2)}KB / ${(initialBudget / 1024).toFixed(0)}KB; largest ${(assets[0]?.gzipBytes / 1024 || 0).toFixed(2)}KB / ${(chunkBudget / 1024).toFixed(0)}KB`);

if (initialBytes > initialBudget || oversizedAssets.length) {
  if (initialBytes > initialBudget) console.error(`[bundle-budget] initial JavaScript exceeds budget by ${((initialBytes - initialBudget) / 1024).toFixed(2)}KB`);
  for (const asset of oversizedAssets) console.error(`[bundle-budget] ${asset.name} exceeds the per-chunk budget`);
  process.exit(1);
}
