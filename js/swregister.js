/**
 * swregister.js — registers the offline service worker and tells the page when a new version is ready.
 *
 * A new worker that finishes installing while an older one still controls the page means the player
 * is running stale files; onUpdate lets the UI offer a reload. The first install (no controller yet)
 * is not an update.
 */

/**
 * @param {ServiceWorkerContainer} container  navigator.serviceWorker
 * @param {function(): void} [onUpdate]
 * @returns {Promise<ServiceWorkerRegistration>}
 */
export function registerServiceWorker(container, onUpdate) {
  return container.register('sw.js').then(function (reg) {
    function watch(worker) {
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && container.controller && onUpdate) onUpdate();
      });
    }
    if (reg.waiting && container.controller && onUpdate) onUpdate();
    watch(reg.installing);
    reg.addEventListener('updatefound', function () { watch(reg.installing); });
    return reg;
  });
}
