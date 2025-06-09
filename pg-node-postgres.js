import postgres from 'postgres'
import { Stats } from './lib/bench.js'

const pool_size = 4

const sql = new postgres({
  host: 'tfb-database',
  username: 'benchmarkdbuser',
  password: 'benchmarkdbpass',
  database: 'hello_world',
  port: 5432,
  max: pool_size, // Maximum connections in pool
  idle_timeout: 30, // Close idle connections after 30s
  max_lifetime: 0, // Connection lifetime in seconds (0 = forever)
  connect_timeout: 30, // Timeout when establishing new connections
  ssl: false,
});

const stats = new Stats()

async function connection () {
  const foo = await sql.reserve()
  let values = await foo`SELECT id FROM Fortune`.values()
  stats.rps++
  stats.conn++
  while (values.length === 12) {
    values = await foo`SELECT id FROM Fortune`.values()
    stats.rps++
  }
}

const connections = []

for (let i = 0; i < pool_size; i++) {
  connections.push(connection())
}

setInterval(() => stats.log(), 1000)

await Promise.all(connections)
