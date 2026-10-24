import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import tls from 'node:tls';
import { Client } from 'pg';
import { validateDevelopmentDatabase, databaseFailureMessage } from '../lib/dev-database.mjs';

const ref = 'ropciikoozdbvsmiulhh';
const uri = `postgresql://postgres.${ref}:synthetic-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;

test('diagnostic rejects wrong projects, alternate endpoints and TLS overrides before connecting', () => {
  assert.equal(validateDevelopmentDatabase(uri, ref), uri);
  for (const invalid of [uri.replace(ref, 'aaaaaaaaaaaaaaaaaaaa'), uri.replace('aws-1-sa-east-1.pooler.supabase.com', 'example.com'), uri.replace('verify-full', 'no-verify'), uri + '&sslmode=disable', uri + '&ssl=false', uri + '&host=example.com', uri + '&sslrootcert=']) {
    assert.throws(() => validateDevelopmentDatabase(invalid, ref));
  }
  assert.throws(() => validateDevelopmentDatabase(uri, undefined));
  assert.throws(() => validateDevelopmentDatabase(undefined, ref));
});

test('diagnostics never echo credentials or provider error messages', () => {
  for (const code of ['SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ENOENT', '28P01', 'ECONNREFUSED']) {
    const message = databaseFailureMessage({ code, message: uri });
    assert(!message.includes('synthetic-password'));
    assert(!message.includes(uri));
  }
  assert.match(databaseFailureMessage({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }), /sslrootcert/);
});

test('pg sslrootcert trusts the selected CA while rejecting unknown certificates and hostname mismatches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lamadeja-tls-'));
  let server;
  try {
    const key = join(directory, 'key.pem');
    const cert = join(directory, 'ca certificate.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
    server = tls.createServer({ key: await readFile(key), cert: await readFile(cert) }, socket => socket.end());
    server.on('tlsClientError', () => {});
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = new URL(uri);
    url.searchParams.set('sslrootcert', cert);
    validateDevelopmentDatabase(url.href, ref);
    const trusted = new Client({ connectionString: url.href }).connectionParameters.ssl;
    const untrusted = new Client({ connectionString: uri }).connectionParameters.ssl;
    assert.notEqual(trusted.rejectUnauthorized, false);
    assert.equal(trusted.checkServerIdentity, undefined);
    async function connect(ssl, servername) {
      const socket = tls.connect({ ...ssl, host: '127.0.0.1', port: server.address().port, servername });
      try { await once(socket, 'secureConnect'); assert.equal(socket.authorized, true); }
      finally { socket.destroy(); }
    }
    await connect(trusted, 'localhost');
    await assert.rejects(connect(untrusted, 'localhost'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    await assert.rejects(connect(trusted, 'wrong.example'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
