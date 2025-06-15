const postgres = require('@pg')
const socket = require('@socket')
const dns = require('@dns')

const { createSocket } = socket
const { getIPAddress } = dns
const { constants } = postgres
const { BinaryInt, VarChar } = constants

const db = {
  hostname: 'tfb-database',
  user: 'benchmarkdbuser',
  pass: 'benchmarkdbpass',
  database: 'hello_world',
  version: constants.PG_VERSION,
  port: 5432
}

async function create_socket () {
  const sock = createSocket()
  const ip = await getIPAddress(db.hostname)
  await sock.connect(ip, db.port)

  const pg = await postgres.createSocket(sock, db)
  sock.noDelay = false

  const fortunes = {
    portal: '',
    formats: [],
    name: 'fortunes',
    maxRows: 0,
    params: [],
    sql: 'select id from Fortune',
    fields: [
      { format: BinaryInt, name: 'id' }
    ]
  }
  const getFortunes = await pg.compile(fortunes)
  const fn = getFortunes

  async function client () {
    let i = 0
    while (i < 1000000) {
      await fn()
      rps++
    }
  }

  return { client }
}

let rps = 0

just.setInterval(() => {
  const { user, system } = just.cpuUsage()
  const { rss } = just.memoryUsage()
  just.print(`rps ${rps} rss ${rss} usr ${user} sys ${system} tot ${user + system}`)
  rps = 0
}, 1000)

const clients = []
for (let i = 0; i < 3; i++) {
  const s = await create_socket()
  clients.push(s.client())
}

await Promise.all(clients)

sock.close()
