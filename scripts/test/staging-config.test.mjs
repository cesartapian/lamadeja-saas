import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stagingConfig, envFile, developmentRef } from '../staging/config.mjs';
const fixture = {
  STAGING_RUN_REAL: '1', STAGING_PROJECT_REF: developmentRef,
  STAGING_DATABASE_URL: `postgresql://postgres.${developmentRef}:synthetic@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  STAGING_ANON_KEY: 'sb_publishable_synthetic', STAGING_TEST_EMAIL: 'fixture@example.invalid',
  STAGING_TEST_PASSWORD: 'synthetic-test-only', STAGING_DATABASE_CA_FILE: '/trusted/ca.crt',
};
test('real staging guard rejects missing opt-in, wrong targets, privileged keys and local CA paths', () => {
  assert.equal(stagingConfig(fixture).authUrl, `https://${developmentRef}.supabase.co`);
  for (const override of [{ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, { STAGING_RUN_REAL: '' }, { STAGING_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa' }, { STAGING_ANON_KEY: 'sb_secret_not-allowed' }, { STAGING_DATABASE_URL: fixture.STAGING_DATABASE_URL + '&sslrootcert=C:/private/ca.crt' }]) {
    assert.throws(() => stagingConfig({ ...fixture, ...override }));
  }
  const serviceKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.throws(() => stagingConfig({ ...fixture, STAGING_ANON_KEY: serviceKey }));
  assert.throws(() => stagingConfig({ ...fixture, STAGING_TEST_PASSWORD: '' }), /Missing configuration/);
});
test('raw compose env files preserve opaque values and reject line injection', () => {
  assert.equal(envFile({ DATABASE_URL: 'postgres://synthetic:$value#literal' }), 'DATABASE_URL=postgres://synthetic:$value#literal\n');
  assert.throws(() => envFile({ DATABASE_URL: 'value\nOTHER=injected' }));
});

test('frontend build guard rejects privileged keys and insecure remote origins', async () => {
  const { assertPublicBuildConfig } = await import('../staging/public-config.mjs');
  const valid = { VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test', VITE_API_URL: 'https://api.example.com' };
  assert.doesNotThrow(() => assertPublicBuildConfig(valid));
  assert.throws(() => assertPublicBuildConfig({ ...valid, VITE_SUPABASE_ANON_KEY: 'sb_secret_private' }));
  assert.throws(() => assertPublicBuildConfig({ ...valid, VITE_API_URL: 'http://api.example.com' }));
  assert.throws(() => assertPublicBuildConfig({ ...valid, VITE_SUPABASE_URL: 'https://user:password@example.com' }));
});
