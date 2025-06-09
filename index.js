import { SQL } from "bun";
import { Pool } from "pg";
import postgres from 'postgres'
import { run, bench } from 'mitata';

const bun = new SQL({
    max: 4, 
    hostname: "tfb-database",
    port: 5432,
    database: "hello_world",
    username: "benchmarkdbuser",
    password: "benchmarkdbpass",
    max: 4, // Maximum connections in pool
    idleTimeout: 30, // Close idle connections after 30s
    maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
    connectionTimeout: 30, // Timeout when establishing new connections
    tls: false,
});

const pg = new Pool({
    max: 4,
    host: 'tfb-database',
    port: 5432,
    database: 'hello_world',
    user: 'benchmarkdbuser',
    password: 'benchmarkdbpass',
});

const sql = postgres({
    max: 4,
    host: 'tfb-database',
    port: 5432,
    database: 'hello_world',
    user: 'benchmarkdbuser',
    password: 'benchmarkdbpass',
})

bench('bun', async () => {
    await bun`SELECT id from Fortune`;
});


bench('postgres.js', async () => {
    await sql`SELECT id from Fortune`;
});

bench('pg', async () => {
    await pg.query({ text: `SELECT id from Fortune`, name: 'foo' });
});

await run({
    format: 'mitata',
    colors: true,
    throw: true
});