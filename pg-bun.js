import { Stats } from './lib/bench.js'
import { SQL } from "bun";

const pool_size = 3
/*
const config = {
//  url: "postgres://benchmarkdbuser:benchmarkdbpass@localhost/hello_world",
//  url: "postgres://user:pass@localhost:5432/dbname",
//  path: './postgresql',
  path: './postgresql/.s.PGSQL.5432',
//  hostname: "tfb-database",
//  port: 5432,
  database: "hello_world",
  user: "benchmarkdbuser",
  password: "benchmarkdbpass",
  max: pool_size, // Maximum connections in pool
  idleTimeout: 30, // Close idle connections after 30s
  maxLifetime: 0, // Connection lifetime in seconds (0 = forever)
  connectionTimeout: 30, // Timeout when establishing new connections
  tls: false,
}
*/

const config = {
  max: pool_size,
  path: './postgresql/.s.PGSQL.5432',
  user: 'benchmarkdbuser',
  password: 'benchmarkdbpass',
  database: 'hello_world'
}
const sql = new SQL(config);

const stats = new Stats()

async function connection () {
  const foo = await sql.reserve()
  stats.conn++
  let values = await foo`SELECT id FROM Fortune`.raw()
  stats.rps++
  while (values.length === 12) {
    values = await foo`SELECT id FROM Fortune`.raw()
    stats.rps++
  }
}

const connections = []

for (let i = 0; i < pool_size; i++) {
  connections.push(connection())
}

setInterval(() => stats.log(), 1000)

await Promise.all(connections)
