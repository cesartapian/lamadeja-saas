// Restrict the diagnostic to this dedicated development pooler before loading pg.
export function validateDevelopmentDatabase(connectionString, projectRef) {
  if (!projectRef || !/^[a-z]{20}$/.test(projectRef)) throw new Error('Set DEV_SUPABASE_PROJECT_REF to the development project ref.');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL is missing or invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== 'aws-1-sa-east-1.pooler.supabase.com'
      || url.port !== '5432' || url.pathname !== '/postgres'
      || decodeURIComponent(url.username) !== `postgres.${projectRef}` || !url.password || url.hash) {
    throw new Error('DATABASE_URL does not match the selected development session pooler.');
  }
  if (url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full'
      || [...url.searchParams.keys()].some(key => !['sslmode', 'sslrootcert'].includes(key))
      || url.searchParams.getAll('sslrootcert').length > 1
      || (url.searchParams.has('sslrootcert') && !url.searchParams.get('sslrootcert'))) {
    throw new Error('Use sslmode=verify-full with an optional sslrootcert path; other connection options are not accepted by this check.');
  }
  return connectionString;
}

export function databaseFailureMessage(error) {
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code)) {
    return 'TLS certificate verification failed. Obtain the current CA from the development Supabase dashboard and configure sslrootcert; check certificate expiry and hostname. Do not disable verification.';
  }
  if (error?.code === 'ENOENT') return 'CA certificate file not found. Check the sslrootcert path on this machine.';
  if (error?.code === '28P01') return 'Database authentication failed. Check the private development database password.';
  return 'Database connection check failed. Check network access, the development endpoint and private configuration. No connection details were printed.';
}
