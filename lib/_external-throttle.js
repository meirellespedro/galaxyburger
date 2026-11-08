const { defaultKvAdapter } = require("./_kv-storage");

// Trava de vazão para serviços públicos com limite por aplicação (não por
// usuário). A política do Nominatim permite no máximo 1 requisição/segundo
// somando todo o tráfego do app: <https://operations.osmfoundation.org/policies/nominatim/>
//
// Com Redis, a trava vale para todas as instâncias (SET NX PX). Sem Redis, ou se
// ele falhar, cai para uma trava local por instância — nunca libera sem limite.
function createExternalThrottle({ kv = defaultKvAdapter, now = () => Date.now() } = {}) {
  const localLastAcquired = new Map();

  function tryAcquireLocally(name, intervalMs) {
    const current = now();
    const last = localLastAcquired.get(name);
    if (last !== undefined && current - last < intervalMs) {
      return false;
    }
    localLastAcquired.set(name, current);
    return true;
  }

  async function tryAcquire(name, intervalMs) {
    if (!kv.isConfigured()) {
      return tryAcquireLocally(name, intervalMs);
    }

    try {
      return await kv.setIfAbsent(`hamburgeria:throttle:${name}`, 1, intervalMs);
    } catch {
      return tryAcquireLocally(name, intervalMs);
    }
  }

  return { tryAcquire };
}

module.exports = {
  createExternalThrottle
};
