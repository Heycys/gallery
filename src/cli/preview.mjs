import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageRoot, previewDirectory, release } from '../shared/paths.mjs';
import { commandArguments, UsageError } from './arguments.mjs';
import { openBrowser } from './browser-open.mjs';
import { findBrowser, startBrowser, lookingArguments } from '../transfer/browser.mjs';

export async function galleryCss() {
  const root = path.join(packageRoot, release ? 'web/assets' : 'src/workbench/app');
  const entries = await fs.readdir(root, { recursive: true });
  const priority = name => name.endsWith('tokens.css') ? 0 : name.endsWith('base.css') ? 1 : name.endsWith('components.css') ? 2 : 3;
  const files = entries.filter(name => name.endsWith('.css')).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
  return (await Promise.all(files.map(name => fs.readFile(path.join(root, name), 'utf8')))).join('\n');
}
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export async function buildPreview(pagePath, outPath) {
  if (path.resolve(pagePath) === path.resolve(outPath)) throw new UsageError('Preview output must differ from its source.');
  let html = await fs.readFile(pagePath, 'utf8');
  const configText = html.match(/<script\b(?=[^>]*\bid=["']preview-config["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const config = configText ? JSON.parse(configText) : {};
  config.widths ??= { normal: 0, narrow: 560 };
  for (const match of [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]) {
    const source = match[1] ?? match[2];
    if (/^[a-z]+:|^\/\//i.test(source)) continue;
    const text = await fs.readFile(path.resolve(path.dirname(pagePath), source), 'utf8');
    html = html.replace(match[0], () => match[1] ? `<style>${text.replace(/<\/style/gi, '<\\/style')}</style>` : `<script>${text.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  const inject = (config.gallery === false ? '' : `<style>${await galleryCss()}</style>`) + `<script>${await fs.readFile(path.join(previewDirectory, 'runtime.js'), 'utf8')}</script>`;
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, head => head + inject) : inject + html;
  const shell = (await fs.readFile(path.join(previewDirectory, 'shell.html'), 'utf8')).replace('{{TITLE}}', () => escape(config.title || path.basename(pagePath))).replace('/*CONFIG*/', () => json(config)).replace('/*PAGE*/', () => json(html));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, shell);
  return config;
}
export async function shootPreview(file, config, directory, only) {
  const shots = (config.shots ?? []).filter(shot => !only || only.includes(shot.name));
  if (only?.some(name => !shots.some(shot => shot.name === name))) throw new UsageError('Unknown screenshot name.');
  for (const shot of shots) if (!/^[\p{L}\p{N}_-]+$/u.test(shot.name)) throw new UsageError(`Invalid screenshot name: ${shot.name}`);
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('Chrome or Edge is required for --shots.');
  await fs.mkdir(directory, { recursive: true });
  const session = await startBrowser({ executablePath, args: lookingArguments() });
  try {
    for (const shot of shots) {
      const page = await session.browser.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        const [width, height] = config.viewport ?? [1280, 800];
        await page.setViewport({ width, height });
        await page.goto(pathToFileURL(file).href + '#' + new URLSearchParams(shot.state ?? {}));
        await page.evaluate(() => window.pv.ready);
        if (shot.run) await page.evaluate(code => window.pv.run(code), shot.run);
        await page.evaluate(() => window.pv.run("const a=document.activeElement;if(a&&!a.matches('input,textarea,[contenteditable]'))a.blur();"));
        await new Promise(resolve => setTimeout(resolve, Math.min(shot.wait ?? 400, 10000)));
        if (errors.length) throw new Error(errors.join('\n'));
        const clip = await page.evaluate(() => window.pv.frameRect());
        await page.screenshot({ path: path.join(directory, shot.name + '.png'), clip });
      } finally { await page.close(); }
    }
  } finally { await session.close(); }
  return shots.length;
}
export async function run(argv) {
  const { positional, options, values } = commandArguments({ argv, options: ['--open'], values: ['--out', '--shots', '--only'] });
  if (positional[0] === 'new') {
    if (positional.length !== 2 || options.size || values.size) throw new UsageError('Use gallery preview new <name>.');
    const file = path.resolve(positional[1].endsWith('.html') ? positional[1] : positional[1] + '.page.html');
    const title = path.basename(file, '.page.html');
    await fs.writeFile(file, `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<script type="application/json" id="preview-config">${json({ title, widths: { normal: 0, narrow: 560 }, shots: [{ name: 'light', state: { theme: 'light' } }, { name: 'dark', state: { theme: 'dark' } }, { name: 'narrow', state: { width: 'narrow' } }] })}</script>\n</head><body data-backdrop="gallery"><div class="pref-overlay"><div class="pref-dialog comp-dialog"><header class="pref-head"><span class="pref-title">${escape(title)}</span></header><div class="comp-body"></div></div></div></body></html>\n`, { flag: 'wx' });
    console.log(file); return;
  }
  if (positional.length !== 1) throw new UsageError('Name one preview page.');
  if (values.has('--only') && !values.has('--shots')) throw new UsageError('--only requires --shots.');
  const input = path.resolve(positional[0]), out = path.resolve(values.get('--out') || input.replace(/(\.page)?\.html?$/i, '') + '.preview.html');
  const config = await buildPreview(input, out);
  console.log(`Preview: ${out}`);
  if (values.has('--shots')) console.log(`Screenshots: ${await shootPreview(out, config, path.resolve(values.get('--shots')), values.get('--only')?.split(','))}`);
  if (options.has('--open')) await openBrowser(pathToFileURL(out).href);
}
