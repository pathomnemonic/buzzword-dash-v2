import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from '../../js/swregister.js';

function fakeWorker() {
  const w = { state: 'installing', handlers: [], addEventListener(_t, fn) { this.handlers.push(fn); } };
  w.finish = (state) => { w.state = state; w.handlers.forEach((fn) => fn()); };
  return w;
}
function fakeReg(extra) {
  const reg = { installing: null, waiting: null, handlers: {}, addEventListener(t, fn) { this.handlers[t] = fn; } };
  return Object.assign(reg, extra);
}

describe('registerServiceWorker', () => {
  it('does not report the first install as an update', async () => {
    const w = fakeWorker();
    const container = { controller: null, register: vi.fn().mockResolvedValue(fakeReg({ installing: w })) };
    const onUpdate = vi.fn();
    await registerServiceWorker(container, onUpdate);
    w.finish('installed');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.register).toHaveBeenCalledWith('sw.js');
  });

  it('reports a new worker that installs while an old one controls the page', async () => {
    const w = fakeWorker();
    const reg = fakeReg();
    const container = { controller: {}, register: vi.fn().mockResolvedValue(reg) };
    const onUpdate = vi.fn();
    await registerServiceWorker(container, onUpdate);
    reg.installing = w;
    reg.handlers.updatefound();
    w.finish('installed');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('reports a worker that was already waiting', async () => {
    const container = { controller: {}, register: vi.fn().mockResolvedValue(fakeReg({ waiting: {} })) };
    const onUpdate = vi.fn();
    await registerServiceWorker(container, onUpdate);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('propagates registration failures', async () => {
    const container = { controller: null, register: vi.fn().mockRejectedValue(new Error('nope')) };
    await expect(registerServiceWorker(container, vi.fn())).rejects.toThrow('nope');
  });
});
