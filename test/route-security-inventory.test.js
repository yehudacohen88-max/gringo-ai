const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { ROUTE_SECURITY, routeKey } = require('../src/shared/routeSecurity');

const CLASSIFICATION_PATTERN = /^(public|admin|webhook-signed|web-identity|blocked-until-PR3a-2|pending-PR\d+[a-z]?)$/;

function mountPathFromLayer(layer) {
  if (!layer || layer.route) return '';
  const regexp = layer.regexp;
  if (!regexp || regexp.fast_slash) return '';
  const stripped = regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
  const mountPath = stripped.replace(/\\\//g, '/');
  if (!mountPath.startsWith('/')) {
    throw new Error(`Cannot read Express mount path from ${regexp}`);
  }
  return mountPath;
}

function joinRoutePath(prefix, routePath) {
  if (!prefix || prefix === '/') return routePath || '/';
  if (!routePath || routePath === '/') return prefix;
  return `${prefix}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
}

function listRegisteredRoutes(stack, prefix = '') {
  const routes = [];
  for (const layer of stack || []) {
    if (layer.route) {
      const path = joinRoutePath(prefix, layer.route.path);
      const methods = Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase());
      for (const method of methods) routes.push({ method, path });
      continue;
    }

    if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
      const mountPath = mountPathFromLayer(layer);
      routes.push(...listRegisteredRoutes(layer.handle.stack, joinRoutePath(prefix, mountPath)));
    }
  }
  return routes;
}

function probePath(path) {
  return path.replace(/:([A-Za-z0-9_]+)/g, 'probe');
}

test('route security map matches every registered Express route', () => {
  const registered = listRegisteredRoutes(app._router.stack);
  const registeredKeys = registered.map((entry) => routeKey(entry.method, entry.path));
  const classifiedKeys = ROUTE_SECURITY.map((entry) => routeKey(entry.method, entry.path));

  const duplicateRegistered = registeredKeys.filter((key, index) => registeredKeys.indexOf(key) !== index);
  const duplicateClassified = classifiedKeys.filter((key, index) => classifiedKeys.indexOf(key) !== index);
  const missing = registeredKeys.filter((key) => !classifiedKeys.includes(key));
  const stale = classifiedKeys.filter((key) => !registeredKeys.includes(key));
  const badClass = ROUTE_SECURITY.filter((entry) => !CLASSIFICATION_PATTERN.test(entry.classification));
  const missingReason = ROUTE_SECURITY.filter((entry) => typeof entry.reason !== 'string' || entry.reason.trim() === '');

  assert.deepEqual(duplicateRegistered, [], 'registered routes must be unique per method and path');
  assert.deepEqual(duplicateClassified, [], 'security map rows must be unique per method and path');
  assert.deepEqual(missing, [], 'every registered route needs a security classification');
  assert.deepEqual(stale, [], 'security map contains a route that is not registered');
  assert.deepEqual(
    badClass.map((entry) => routeKey(entry.method, entry.path)),
    [],
    'classification must be public, admin, webhook-signed, web-identity, blocked-until-PR3a-2, or pending-PRxx'
  );
  assert.deepEqual(
    missingReason.map((entry) => routeKey(entry.method, entry.path)),
    [],
    'every classified route needs a reason'
  );
  assert.equal(registered.length, ROUTE_SECURITY.length);
  assert.deepEqual(
    ROUTE_SECURITY.filter((entry) => entry.classification === 'pending-PR3a').map((entry) => routeKey(entry.method, entry.path)),
    [],
    'PR3a-1 leaves no route classified as pending-PR3a'
  );
});

test('admin routes reject a request that has no admin key', async () => {
  const adminRoutes = ROUTE_SECURITY.filter((entry) => entry.classification === 'admin');
  assert.ok(adminRoutes.length > 0);

  const server = app.listen(0);
  try {
    const address = server.address();
    for (const entry of adminRoutes) {
      const response = await fetch(`http://127.0.0.1:${address.port}${probePath(entry.path)}`, {
        method: entry.method,
      });
      assert.equal(
        response.status === 401 || response.status === 403,
        true,
        `${entry.method} ${entry.path} returned ${response.status}`
      );
      await response.arrayBuffer();
    }

    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(health.status, 200);
    await health.arrayBuffer();
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
