import "./workspace-env.mjs";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { loginTitle } from "../../src/shared/web-links.mjs";
import { frameable, pageTitle } from "../../src/editor/unfurl.mjs";
// Use the project's compiler so this test also runs on Node versions without native TS loading.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../../src/workbench/app/features/sidebar/link-paste.ts', import.meta.url))], bundle: true, format: 'esm', write: false });
const { pastedLink } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const yuque = 'https://www.yuque.com/sample/ab12cd/x0y1z2w3v4u5t6s7';
const id = '0123456789abcdef0123456789abcdef';
for (const title of ['钉钉文档 - 钉钉统一身份认证', 'Sign in | Example', '登录 - 语雀', '401 - Unauthorized']) assert.ok(loginTitle(title));
for (const title of ['How to log in', '登录功能设计', '统一身份认证设计', 'SSO architecture', '微积分基础']) assert.ok(!loginTitle(title), title);

const dom = new JSDOM();
const previous = globalThis.document;
globalThis.document = dom.window.document;
try {
  assert.deepEqual(pastedLink(yuque, `<a href="${yuque}">微积分基础</a>`), { url: yuque, title: '微积分基础' });
  assert.equal(pastedLink('https://example.com/', `<a href="${yuque}">Wrong</a>`), null);
  assert.equal(pastedLink('', '<a href="javascript:alert(1)">x</a>'), null);
  assert.deepEqual(pastedLink(`<iframe src="https://team.notion.site/ebd/${id}?a=1&amp;b=2" onload="alert(1)"></iframe>`, ''), { url: `https://team.notion.site/ebd/${id}?a=1&b=2`, title: '' });
  assert.equal(pastedLink(yuque, `<a href="${yuque}">登录 - 语雀</a>`).title, '');
  assert.equal(pastedLink(yuque, ''), null, 'plain URL uses normal input');
  assert.equal(pastedLink('', '<a href="https://a.example/">A</a><a href="https://b.example/">B</a>'), null, 'multiple links are ambiguous');
  assert.equal(pastedLink(yuque, `<a href="${yuque}">\u200b\u2061微积分基础</a>`).title, '微积分基础');
} finally {
  globalThis.document = previous;
  dom.window.close();
}

const site = http.createServer((req, res) => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/login' }); res.end(); return; }
  if (req.url === '/deny') headers['X-Frame-Options'] = 'DENY';
  if (req.url === '/deny-twice') headers['X-Frame-Options'] = ['SAMEORIGIN', 'SAMEORIGIN'];
  if (req.url === '/policy-wins') Object.assign(headers, { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': 'frame-ancestors *' });
  if (req.url === '/allowlist') headers['Content-Security-Policy'] = 'frame-ancestors https://gallery.example';
  if (req.url === '/self') headers['Content-Security-Policy'] = "frame-ancestors 'self'";
  if (req.url === '/yuque-policy') headers['Content-Security-Policy'] = ["script-src 'self'; report-uri /r/csp/report", "frame-ancestors 'self'"];
  if (req.url === '/two-policies') headers['Content-Security-Policy'] = "frame-ancestors *, frame-ancestors 'none'";
  if (req.url === '/two-policies-reversed') headers['Content-Security-Policy'] = "frame-ancestors 'none', frame-ancestors *";
  if (req.url === '/duplicate-directive') headers['Content-Security-Policy'] = "frame-ancestors *; frame-ancestors 'none'";
  if (req.url === '/report-only') headers['Content-Security-Policy-Report-Only'] = "frame-ancestors 'none'";
  if (req.url === '/unauthorized') headers['X-Frame-Options'] = 'DENY';
  res.writeHead(req.url === '/unauthorized' ? 401 : req.url === '/error' ? 503 : 200, headers);
  res.end(`<title>${req.url === '/login' || req.url === '/sso-title' ? '钉钉文档 - 钉钉统一身份认证' : 'Real document &amp; title'}</title>`);
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${site.address().port}`;
try {
  assert.deepEqual(await pageTitle(`${base}/ok`), { title: 'Real document & title' });
  for (const route of ['/redirect', '/login', '/sso-title', '/unauthorized']) assert.deepEqual(await pageTitle(base + route), { title: '', reason: 'auth' });
  assert.deepEqual(await pageTitle(`${base}/error`), { title: '', reason: 'unknown' });
  assert.deepEqual(await frameable(`${base}/unauthorized`), { frameable: true, reason: 'auth' });
  assert.deepEqual(await frameable(`${base}/redirect`), { frameable: true, reason: 'auth' });
  assert.deepEqual(await frameable(`${base}/deny`), { frameable: false, reason: 'x-frame-options' });
  assert.deepEqual(await frameable(`${base}/deny-twice`), { frameable: false, reason: 'x-frame-options' }, 'a header sent twice reaches us joined by a comma');
  assert.deepEqual(await frameable(`${base}/self`), { frameable: false, reason: 'frame-ancestors' });
  for (const route of ['/yuque-policy', '/two-policies', '/two-policies-reversed']) assert.deepEqual(await frameable(base + route), { frameable: false, reason: 'frame-ancestors' }, route);
  for (const route of ['/duplicate-directive', '/report-only']) assert.deepEqual(await frameable(base + route), { frameable: true }, route);
  assert.deepEqual(await frameable(`${base}/policy-wins`), { frameable: true });
  assert.deepEqual(await frameable(`${base}/allowlist`), { frameable: true, reason: 'unknown' });
  assert.deepEqual(await frameable(`${base}/error`), { frameable: true, reason: 'unknown' });
} finally { await new Promise(resolve => site.close(resolve)); }
console.log('Checked browser clipboard titles, login responses and frame policy uncertainty.');
