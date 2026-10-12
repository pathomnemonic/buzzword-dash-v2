// A minimal in-memory IndexedDB for the tests (the real one does not exist in jsdom). Supports what js/cardstore.js
// uses: open + upgrade, object stores with a keyPath or out-of-line keys, put / delete / clear / get / getAll in
// transactions that commit all at once or not at all, abort(), and a switch that makes writes fail like a full disk.

export function createFakeIndexedDB() {
  const dbs = new Map(); // name -> { stores: Map<storeName, {keyPath, data: Map}> }
  const fake = { failPuts: false, failOpen: false, opened: 0, putCount: 0, dbs };
  const later = (fn) => setTimeout(fn, 0);

  function request() { return { onsuccess: null, onerror: null, result: undefined, error: null }; }

  fake.open = function (name) {
    const req = request();
    later(() => {
      if (fake.failOpen) { req.error = new Error('blocked'); req.onerror && req.onerror(); return; }
      fake.opened++;
      let entry = dbs.get(name);
      const fresh = !entry;
      if (fresh) { entry = { stores: new Map() }; dbs.set(name, entry); }
      const db = {
        objectStoreNames: { contains: (n) => entry.stores.has(n) },
        createObjectStore(n, opts) { entry.stores.set(n, { keyPath: opts && opts.keyPath, data: new Map() }); return {}; },
        close() {}, onversionchange: null,
        transaction(names, mode) { return makeTx(entry, [].concat(names), mode); }
      };
      req.result = db;
      if (fresh && req.onupgradeneeded) req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    });
    return req;
  };

  function makeTx(entry, names, mode) {
    names.forEach((n) => { if (!entry.stores.has(n)) throw new Error('NotFoundError ' + n); });
    const staged = new Map(names.map((n) => [n, new Map(entry.stores.get(n).data)]));
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
    let pending = 0; let done = false; let aborted = false;
    function settle() {
      if (done || pending > 0) return;
      later(() => {
        if (done || pending > 0) return;
        done = true;
        if (aborted) return;
        if (mode === 'readwrite') names.forEach((n) => { entry.stores.get(n).data = staged.get(n); });
        tx.oncomplete && tx.oncomplete();
      });
    }
    function fail(err) {
      if (done) return;
      aborted = true; done = true; tx.error = err;
      tx.onerror && tx.onerror();
      tx.onabort && tx.onabort();
    }
    tx.abort = function () { if (done) throw new Error('InvalidStateError'); aborted = true; done = true; later(() => tx.onabort && tx.onabort()); };
    tx.objectStore = function (n) {
      const store = entry.stores.get(n);
      const data = staged.get(n);
      function op(fn, write) {
        if (write && mode !== 'readwrite') throw new Error('ReadOnlyError');
        const req = request(); pending++;
        later(() => {
          pending--;
          if (aborted) return;
          try { req.result = fn(); } catch (e) { fail(e); return; }
          req.onsuccess && req.onsuccess();
          settle();
        });
        return req;
      }
      return {
        put(v, k) {
          if (fake.failPuts) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
          fake.putCount++;
          const key = store.keyPath ? v[store.keyPath] : k;
          return op(() => { data.set(key, structuredClone(v)); return key; }, true);
        },
        delete(k) { return op(() => { data.delete(k); }, true); },
        clear() { return op(() => { data.clear(); }, true); },
        get(k) { return op(() => data.get(k)); },
        getAll() { return op(() => Array.from(data.values()).map((v) => structuredClone(v))); },
        count() { return op(() => data.size); }
      };
    };
    settle();
    return tx;
  }
  return fake;
}
