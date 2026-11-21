import './workspace-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPreview } from '../../src/cli/preview.mjs';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-preview-test-'));
try {
  const input = path.join(directory, 'page.html'), output = path.join(directory, 'preview.html');
  await fs.writeFile(path.join(directory, 'style.css'), '.example { color:red }');
  await fs.writeFile(path.join(directory, 'script.js'), 'window.test="embedded";');
  await fs.writeFile(input, '<html><head><script type="application/json" id="preview-config">{"title":"A < B", "gallery":false}</script><link rel="stylesheet" href="style.css"><script src="script.js"></script></head><body>Example</body></html>');
  const config = await buildPreview(input, output), html = await fs.readFile(output, 'utf8');
  assert.equal(config.gallery, false); assert.equal(config.widths.narrow, 560);
  assert.ok(html.includes('A &lt; B') && html.includes('.example { color:red }') && html.includes('window.test='));
  assert.ok(!html.includes('src="script.js"') && !html.includes('href="style.css"'));
  assert.ok(html.includes('window.preview') && html.includes('frame.srcdoc = PAGE'));
  await assert.rejects(buildPreview(input, input), /differ/);
  console.log('standalone preview embedding and source protection passed');
} finally { await fs.rm(directory, { recursive: true, force: true }); }
