export const createRuntimeCache = ({
  cacheNames = [],
  ttlMs = 0,
  normalizeKey = (value) => String(value || '').trim()
} = {}) => {
  const createRuntimeCacheEntry = () => {
    return {
      key: '',
      value: null,
      loadedAt: 0
    };
  };

  const cloneRuntimeCacheValue = (value) => {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (value && typeof value === 'object') {
      return { ...value };
    }
    return value ?? null;
  };

  const runtimeCache = Object.fromEntries(
    cacheNames.map((cacheName) => [cacheName, createRuntimeCacheEntry()])
  );

  const read = (cacheName, key = '') => {
    const entry = runtimeCache[cacheName];
    const normalizedKey = normalizeKey(key);
    if (!entry) {
      return null;
    }

    const isFresh = (Date.now() - Number(entry.loadedAt || 0)) < ttlMs;
    if (!isFresh) {
      return null;
    }

    if (normalizedKey && entry.key !== normalizedKey) {
      return null;
    }

    return cloneRuntimeCacheValue(entry.value);
  };

  const write = (cacheName, value, key = '') => {
    if (!(cacheName in runtimeCache)) {
      return value;
    }

    runtimeCache[cacheName] = {
      key: normalizeKey(key),
      value: cloneRuntimeCacheValue(value),
      loadedAt: Date.now()
    };

    return value;
  };

  const invalidate = (...cacheNamesToInvalidate) => {
    const names = cacheNamesToInvalidate.length ? cacheNamesToInvalidate : Object.keys(runtimeCache);
    names.forEach((cacheName) => {
      if (!(cacheName in runtimeCache)) {
        return;
      }
      runtimeCache[cacheName] = createRuntimeCacheEntry();
    });
  };

  return {
    read,
    write,
    invalidate
  };
};
