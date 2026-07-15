import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { stopOwnedBackendChild } from './backend-lifecycle.mjs';

function createChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    child.signalCode = signal;
    queueMicrotask(() => child.emit('exit', null, signal));
    return true;
  };
  return child;
}

test('requests graceful backend shutdown before sending a process signal', async () => {
  const child = createChild();
  const result = await stopOwnedBackendChild({
    child,
    requestShutdown: async () => {
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
      });
    },
    timeoutMs: 50,
  });

  assert.deepEqual(result, { forced: false, graceful: true });
  assert.deepEqual(child.signals, []);
});

test('uses SIGKILL only when the graceful shutdown deadline expires', async () => {
  const child = createChild();
  const result = await stopOwnedBackendChild({
    child,
    requestShutdown: async () => {},
    timeoutMs: 10,
  });

  assert.deepEqual(result, { forced: true, graceful: false });
  assert.deepEqual(child.signals, ['SIGKILL']);
});

test('falls back to SIGTERM after a failed shutdown request on non-Windows systems', async () => {
  const child = createChild();
  const errors = [];
  const result = await stopOwnedBackendChild({
    child,
    requestShutdown: async () => {
      throw new Error('offline');
    },
    platform: 'linux',
    timeoutMs: 50,
    onShutdownError: (error) => errors.push(error.message),
  });

  assert.deepEqual(result, { forced: false, graceful: true });
  assert.deepEqual(child.signals, ['SIGTERM']);
  assert.deepEqual(errors, ['offline']);
});
