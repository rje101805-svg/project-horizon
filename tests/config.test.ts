import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultServerUrl, validateServerUrl } from '../src/config';
test('development defaults locally but production never falls back to localhost', () => {
  assert.equal(defaultServerUrl(true, 'localhost'), 'http://localhost:3001');
  assert.equal(defaultServerUrl(false, 'localhost'), '');
  assert.equal(defaultServerUrl(false, 'example.github.io'), '');
  assert.equal(defaultServerUrl(true, 'remote-preview.example'), '');
});
test('production configured URL requires HTTPS and rejects loopback or embedded credentials', () => {
  assert.equal(defaultServerUrl(false, 'example.github.io', 'https://server.example/'), 'https://server.example');
  for (const url of ['http://server.example', 'http://localhost:3001', 'https://localhost:3001', 'https://127.0.0.1', 'https://[::1]', 'https://user:password@server.example', 'https://server.example/socket.io', 'https://server.example/?token=foo']) {
    assert.throws(() => defaultServerUrl(false, 'example.github.io', url));
  }
});
test('explicit local preview override works while hosted HTTP overrides are rejected', () => {
  assert.equal(validateServerUrl('http://127.0.0.1:3001/', true), 'http://127.0.0.1:3001');
  assert.throws(() => validateServerUrl('http://127.0.0.1:3001/', false));
  assert.throws(() => validateServerUrl('http://server.example/', true));
});
