const { Pool } = require('pg');

const databaseUrl = new URL(process.env.DATABASE_URL);
// node-postgres replaces an explicit ssl object when sslmode is present in the
// URI. Remove URI SSL options and enforce verified TLS below instead.
for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
    databaseUrl.searchParams.delete(parameter);
}

const pool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' },
    enableChannelBinding: true,
    max: Math.max(1, Number(process.env.PG_POOL_MAX || 5)),
    idleTimeoutMillis: Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)),
    connectionTimeoutMillis: Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS || 8000)),
    keepAlive: true
});

pool.on('error', error => {
    console.error('PostgreSQL idle client error:', error.message);
});

module.exports = pool;
