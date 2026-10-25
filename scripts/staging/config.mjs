import { isPublicKey } from './public-config.mjs';
import { validateDevelopmentDatabase } from '../lib/dev-database.mjs';
export const developmentRef = 'ropciikoozdbvsmiulhh';
export function stagingConfig(env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS verification must remain enabled.');
  const names = ['STAGING_PROJECT_REF', 'STAGING_DATABASE_URL', 'STAGING_ANON_KEY', 'STAGING_TEST_EMAIL', 'STAGING_TEST_PASSWORD', 'STAGING_DATABASE_CA_FILE'];
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
  if (env.STAGING_RUN_REAL !== '1' || env.STAGING_PROJECT_REF !== developmentRef) throw new Error('Explicit opt-in to the selected development project is required.');
  const databaseUrl = validateDevelopmentDatabase(env.STAGING_DATABASE_URL, developmentRef);
  if (new URL(databaseUrl).searchParams.has('sslrootcert')) throw new Error('Use STAGING_DATABASE_CA_FILE instead of a machine-specific URI certificate path.');
  const key = env.STAGING_ANON_KEY;
  if (!isPublicKey(key)) throw new Error('Use a public publishable/anon key, never a service-role key.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.STAGING_TEST_EMAIL)) throw new Error('A dedicated test account email is required.');
  return { databaseUrl, publicKey: key, authUrl: `https://${developmentRef}.supabase.co`, email: env.STAGING_TEST_EMAIL, password: env.STAGING_TEST_PASSWORD, caFile: env.STAGING_DATABASE_CA_FILE };
}
export function envFile(values) {
  return Object.entries(values).map(([name, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || /[\r\n\0]/.test(String(value))) throw new Error('Invalid runtime environment value.');
    return `${name}=${value}`;
  }).join('\n') + '\n';
}
