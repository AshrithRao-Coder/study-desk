import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const result = await build({
  absWorkingDir: root, entryPoints: ['app.jsx'], bundle: true, minify: true,
  format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
});
const path = new URL('index.html', import.meta.url);
let html = await readFile(path, 'utf8');
if (!/<script>[\s\S]*?<\/script>/.test(html)) throw new Error('Missing app script in index.html');
html = html.replace(/<script>[\s\S]*?<\/script>/, () => `<script>\n${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const css = await readFile(new URL('enhancements.css', import.meta.url), 'utf8');
html = html.replace(/<style id="enhancements">[\s\S]*?<\/style>\s*/g, '');
html = html.replace('</head>', `<style id="enhancements">${css}</style>\n</head>`);
await writeFile(path, html);
const workerPath=new URL('sw.js',import.meta.url);
let worker=await readFile(workerPath,'utf8');
const declaration=/const CACHE = "[^"]+";/;
if (!declaration.test(worker)) throw new Error('Missing service worker cache declaration');
const hash=createHash('sha256').update(html).update(worker.replace(declaration,'const CACHE = "<build>";'));
const assets=await Promise.all(['manifest.webmanifest','icon-192.png','icon-512.png'].map(name=>readFile(new URL(name,import.meta.url))));
for (const asset of assets) hash.update(asset);
worker=worker.replace(declaration,()=>`const CACHE = "study-desk-${hash.digest('hex').slice(0,16)}";`);
await writeFile(workerPath,worker);
const output=new URL('dist/',import.meta.url);
await mkdir(output,{recursive:true});
await Promise.all([
  writeFile(new URL('index.html',output),html),
  writeFile(new URL('sw.js',output),worker),
  ...['manifest.webmanifest','icon-192.png','icon-512.png'].map(name=>copyFile(new URL(name,import.meta.url),new URL(name,output))),
]);
console.log('Built self-contained index.html and deployable dist/');
