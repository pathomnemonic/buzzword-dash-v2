import { describe, it, expect } from 'vitest';
import { Multiplayer } from '../../js/multiplayer.js';

describe('hosting a room', () => {
  it('draws a new code when the first one is already taken, and still accepts connections', async () => {
    const peers = [];
    window.Peer = function (id) {
      this.id = id; this.handlers = {}; peers.push(this);
      this.on = (name, fn) => { this.handlers[name] = fn; };
      this.destroy = () => {};
      const n = peers.length;
      setTimeout(() => { if (n === 1) this.handlers.error({ type: 'unavailable-id', message: 'taken' }); else this.handlers.open(); }, 0);
    };
    const mp = new Multiplayer();
    const codes = [];
    const errors = [];
    mp.onError = (e) => errors.push(e);
    await mp.hostGame((code) => codes.push(code));
    await new Promise((r) => setTimeout(r, 20));
    expect(errors).toEqual([]);
    expect(peers.length).toBe(2);
    expect(peers[0].id).not.toBe(peers[1].id);
    expect(codes).toEqual([mp.roomCode]);
    expect(typeof peers[1].handlers.connection).toBe('function');
    delete window.Peer;
  });
});
