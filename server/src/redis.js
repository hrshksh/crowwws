// Redis client with in-memory fallback when Redis is not available
let redis;
let connected = false;
let pubClient = null;
let subClient = null;

function createInMemoryStore() {
  const store = new Map();
  const sets = new Map();
  const ttls = new Map();

  function cleanup(key) {
    const expiry = ttls.get(key);
    if (expiry && Date.now() > expiry) {
      store.delete(key);
      sets.delete(key);
      ttls.delete(key);
      return true;
    }
    return false;
  }

  console.log('[MemoryStore] Using in-memory store (Redis not available)');

  return {
    async connect() { return true; },
    disconnect() {},
    async get(key) { cleanup(key); return store.get(key) || null; },
    async set(key, value, ...args) {
      store.set(key, value);
      if (args[0] === 'EX' && args[1]) {
        ttls.set(key, Date.now() + args[1] * 1000);
      }
      return 'OK';
    },
    async del(...keys) {
      keys.forEach(k => { store.delete(k); sets.delete(k); ttls.delete(k); });
      return keys.length;
    },
    async incr(key) {
      const val = parseInt(store.get(key) || '0', 10) + 1;
      store.set(key, String(val));
      return val;
    },
    async expire(key, seconds) {
      ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    async sadd(key, ...members) {
      if (!sets.has(key)) sets.set(key, new Set());
      members.forEach(m => sets.get(key).add(m));
      return members.length;
    },
    async srem(key, ...members) {
      if (!sets.has(key)) return 0;
      members.forEach(m => sets.get(key).delete(m));
      return members.length;
    },
    async smembers(key) {
      cleanup(key);
      return sets.has(key) ? Array.from(sets.get(key)) : [];
    },
    async scard(key) {
      cleanup(key);
      return sets.has(key) ? sets.get(key).size : 0;
    },
    async keys(pattern) {
      const prefix = pattern.replace('*', '');
      const result = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) result.push(k);
      }
      for (const k of sets.keys()) {
        if (k.startsWith(prefix) && !result.includes(k)) result.push(k);
      }
      return result;
    },
    on() { return this; },
  };
}

// Try to connect to Redis, fall back to memory immediately on failure
try {
  const Redis = require('ioredis');
  const testClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
    connectTimeout: 2000,
    enableOfflineQueue: false,
  });

  // Prevent missing error handler logs if Redis fails to connect
  testClient.on('error', () => {});

  // Attempt connection synchronously-ish: set up memory store first, swap if Redis works
  redis = createInMemoryStore();

  testClient.connect()
    .then(() => {
      console.log('[Redis] Connected — switching from in-memory to Redis');
      redis = testClient;
      pubClient = testClient.duplicate();
      subClient = testClient.duplicate();

      // Catch error events to prevent Node.js unhandled exceptions
      redis.on('error', (err) => console.log('[Redis] Error:', err.message));
      pubClient.on('error', (err) => console.log('[Redis] Pub Error:', err.message));
      subClient.on('error', (err) => console.log('[Redis] Sub Error:', err.message));
      
      connected = true;
    })
    .catch(() => {
      console.log('[Redis] Connection failed — continuing with in-memory store');
      testClient.disconnect();
    });

} catch {
  redis = createInMemoryStore();
}

// Export a proxy that always delegates to the current `redis` value
// so if Redis connects later, callers automatically use the real client
module.exports = new Proxy({}, {
  get(_, prop) {
    if (prop === 'isRealRedis') return connected;
    if (prop === 'pubClient') return pubClient;
    if (prop === 'subClient') return subClient;
    return typeof redis[prop] === 'function'
      ? redis[prop].bind(redis)
      : redis[prop];
  },
});
