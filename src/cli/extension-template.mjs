import fs from 'node:fs/promises';
import path from 'node:path';
import { extensionDirectory } from '../shared/extension-manifest.mjs';
import { defaultWorkspace, ensureWorkspace } from '../shared/workspace.mjs';
import { withOutlineLock } from '../shared/outline.mjs';

// What gallery extension new --ui/--server writes: a program that works as it stands, so that its writer
// starts from a round trip that runs rather than from the reference. With both, the workbench's button
// asks the backend (through Gallery's proxy, with the token) and shows its answer; gallery extension check
// <id> --press "<name>" presses it in the sandbox and says what the backend answered.

const workbenchScript = (id, name, server) => `// The workbench side: activate(api) runs when the extension is enabled (and again after each edit of a
// file here); what it returns runs when it is disabled or reloaded.
export function activate(api) {
  const button = document.createElement('button');
  button.className = 'extension-${id}-button';
  button.textContent = ${JSON.stringify(name)};
  button.setAttribute('aria-label', ${JSON.stringify(name)});
${server ? `  button.addEventListener('click', async () => {
    try {
      // The backend's /hello, through Gallery's proxy: api.fetch(path) asks api.backend + path, with the token.
      const response = await api.fetch('hello');
      const answer = await response.json();
      api.toast(response.ok ? answer.message : \`${'${'}response.status}: ${'${'}answer.error ?? 'failed'}\`, { tone: response.ok ? 'info' : 'error' });
    } catch (error) {
      api.toast(String(error), { tone: 'error' });
    }
  });` : `  button.addEventListener('click', () => api.toast(${JSON.stringify(name)}));`}
  api.slot('sidebar-footer').append(button);
  return () => button.remove();
}
`;

const workbenchStyle = (id) => `.extension-${id}-button { border:0; border-radius:6px; padding:6px 10px; background:var(--bacIntTra); color:var(--texPri); font:inherit; cursor:pointer; }
.extension-${id}-button:hover { background:var(--bacTerTra); }
`;

const serverScript = (name) => `// The backend: Gallery starts it on the first request to /__gallery/extensions/<id>/api/*, gives it a port
// (GALLERY_EXTENSION_PORT), restarts it when a file here changes, and stops it with Gallery. To give the
// sidebar columns of its own, write <column>.json files (sidebar.json's format) in GALLERY_EXTENSION_COLUMNS
// (this folder's columns/; make it first): a change there restarts nothing, and the sidebar shows it at once.
import http from 'node:http';
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/health') return response.end(JSON.stringify({ ok: true, pid: process.pid }));
  if (pathname === '/hello' && request.method === 'GET') return response.end(JSON.stringify({ ok: true, message: ${JSON.stringify(`${name}：后台已连上`)} }));
  response.statusCode = 404;
  response.end(JSON.stringify({ ok: false, error: \`no route \${request.method} \${pathname}\` }));
});
server.listen(Number(process.env.GALLERY_EXTENSION_PORT), process.env.GALLERY_EXTENSION_HOST || '127.0.0.1');
process.on('SIGTERM', () => server.close());
`;

const agentNotes = (id, name, { ui, server }) => `# ${name}

Edit this extension in its own folder. Use Gallery's public slot, toast, confirm and menu API for UI.
Read references/extensions.md (in the Gallery skill's folder) for the API and lifecycle.
${ui && server ? `The button in the sidebar's footer (workbench.js) asks the backend's GET /hello (server.mjs) with \`api.fetch('hello')\` (Gallery's proxy, the token added), and shows its answer in a toast. Reach the backend only through \`api.fetch(path)\` or \`api.backend\`, never an address worked out from \`import.meta.url\`.\n` : ""}Run \`gallery extension check ${id}\` after changes; it tests an isolated copy${ui && server ? `, and \`--press ${JSON.stringify(name)}\` presses the button there and says what the backend answered` : ""}.
Enable in the user's Gallery only when requested: \`gallery extension enable ${id}\`.
`;

export async function createProgram(id, name, { ui, server }) {
  const folder = extensionDirectory(id);
  await ensureWorkspace(defaultWorkspace());
  const files = {};
  await withOutlineLock(defaultWorkspace(), async () => {
    await fs.mkdir(path.dirname(folder), { recursive: true });
    if ((await fs.lstat(path.dirname(folder))).isSymbolicLink()) throw new Error('Extensions directory cannot be a symlink.');
    await fs.mkdir(folder); // never overwrite an existing extension
    const manifest = { id, name, version: '0.1.0', description: '', agent: 'AGENT.md', ...(ui ? { workbench: { script: 'workbench.js', style: 'workbench.css' } } : {}), ...(server ? { server: { command: ['node', 'server.mjs'] } } : {}) };
    files['extension.json'] = 'the manifest: name, version, the workbench files, the backend command';
    await fs.writeFile(path.join(folder, 'extension.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (ui) {
      await fs.writeFile(path.join(folder, 'workbench.js'), workbenchScript(id, name, server));
      await fs.writeFile(path.join(folder, 'workbench.css'), workbenchStyle(id));
      files['workbench.js'] = server ? "activate(api): a button in the sidebar's footer that asks the backend's /hello and shows the answer" : "activate(api): a button in the sidebar's footer";
      files['workbench.css'] = "the button's look";
    }
    if (server) {
      await fs.writeFile(path.join(folder, 'server.mjs'), serverScript(name));
      files['server.mjs'] = 'the backend: GET /health and GET /hello, JSON';
    }
    await fs.writeFile(path.join(folder, 'AGENT.md'), agentNotes(id, name, { ui, server }));
    files['AGENT.md'] = 'how an Agent uses this extension (no secrets here)';
  });
  const width = Math.max(...Object.keys(files).map((name) => name.length));
  console.log([
    `Created extension ${id}: ${folder}`,
    ...Object.entries(files).map(([file, what]) => `  ${file.padEnd(width)}  ${what}`),
    `It runs as it stands. Edit its files, then gallery extension check ${id}${ui && server ? ` --press ${JSON.stringify(name)}` : ''}`,
    `Enable when ready: gallery extension enable ${id}`,
    `Agent instructions: ${path.join(folder, 'AGENT.md')}`,
  ].join('\n'));
}
