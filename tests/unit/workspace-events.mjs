import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Two module instances represent two tabs sharing Web Locks and a BroadcastChannel.
const saved = Object.fromEntries(['navigator', 'EventSource', 'BroadcastChannel'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const channels = new Set(), streams = [];
let held = false;
const waiting = [];
const locks = {
  async request(_name, options, callback) {
    if (options.ifAvailable && held) return callback(null);
    if (held) await new Promise((resolve, reject) => {
      const ready = () => options.signal?.aborted ? reject(new Error('aborted')) : resolve();
      waiting.push(ready);
      options.signal?.addEventListener('abort', () => { const at = waiting.indexOf(ready); if (at >= 0) waiting.splice(at, 1); reject(new Error('aborted')); }, { once: true });
    });
    held = true;
    try { return await callback({}); }
    finally { held = false; waiting.shift()?.(); }
  },
};
class Channel {
  constructor() { channels.add(this); }
  postMessage(data) { for (const other of channels) if (other !== this) other.onmessage?.({ data }); }
  close() { channels.delete(this); }
}
class Events {
  constructor(url) { this.url = url; streams.push(this); }
  close() { this.closed = true; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
try {
  Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
  Object.defineProperty(globalThis, 'BroadcastChannel', { value: Channel, configurable: true });
  Object.defineProperty(globalThis, 'EventSource', { value: Events, configurable: true });
  const bundled = await build({ entryPoints: ['src/workbench/app/workspace/api.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
  const url = 'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64');
  const first = await import(url + '#first'), second = await import(url + '#second');
  const firstExtensions = [], secondExtensions = [];
  let firstWorkspace = 0, secondWorkspace = 0;
  const stopA = first.onWorkspaceChange(() => firstWorkspace++);
  const stopB = first.onExtensionChange(id => firstExtensions.push(id));
  const stopC = second.onWorkspaceChange(() => secondWorkspace++);
  const stopD = second.onExtensionChange(id => secondExtensions.push(id));
  await tick();
  assert.equal(streams.length, 1, 'one stream shared across subscribers and tabs');
  streams[0].onmessage({ data: 'workspace 1' });
  streams[0].onmessage({ data: 'extensions sample' });
  assert.deepEqual([firstWorkspace, secondWorkspace, firstExtensions, secondExtensions], [1, 1, ['sample'], ['sample']]);
  stopA();
  assert.ok(!streams[0].closed, 'other subscribers still need the stream');
  stopB();
  await tick();
  assert.equal(streams.length, 2, 'waiting tab takes over the lock');
  streams[1].onopen();
  assert.equal(secondWorkspace, 2, 'the new owner refreshes after handover');
  assert.deepEqual(secondExtensions, ['sample', null], 'extension state is refreshed after handover');
  streams[1].onerror(); streams[1].onopen();
  assert.equal(secondWorkspace, 3, 'reconnection refreshes the tree');
  assert.deepEqual(secondExtensions, ['sample', null, null], 'reconnection refreshes extensions');
  stopC(); stopD();
  assert.ok(streams[1].closed);
  console.log('Checked shared workspace and extension events: one stream, broadcast, handover, reconnect and unsubscribe.');
} finally {
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
