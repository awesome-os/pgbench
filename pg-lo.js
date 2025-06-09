import { net } from 'lib/net.js'
import { Loop } from 'lib/loop.js'
import { Timer } from 'lib/timer.js'
import { Stats } from 'lib/bench.js'
import { Digest } from 'lib/hash.js'
import { encode } from 'lib/encode.js'
import { system } from 'lib/system.js'
import { dump } from 'lib/binary.js'
import { constants } from 'lib/pg/common.js'

const { 
  assert, getenv, ptr, utf8_encode_into_at_offset, utf8_encode_into, core,
  utf8_decode
} = lo
const {
  socket, close, send2, recv2, connect,
  SOCK_STREAM, AF_INET, SOCK_NONBLOCK, EINPROGRESS, SOCKADDR_LEN, AF_UNIX
} = net
const { sockaddr_in, sockaddr_un } = net.types
const { BinaryInt, messageTypes, AuthenticationMD5Password } = constants
const { fcntl, O_NONBLOCK } = core
const { Blocked } = Loop
const {
  ParseComplete, BackendKeyData, ParameterStatus, BindComplete, DataRow,
  ParameterDescription, RowDescription, AuthenticationOk, CommandComplete,
  ReadyForQuery
} = messageTypes

function md5 (buf) {
  const digest = hasher.hash(buf)
  const hex = ptr(new Uint8Array(digest.length * 2))
  const size = encode.hex_encode(digest, digest.length, hex, hex.length)
  return utf8_decode(hex.ptr, size)
}

function startup (db) {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  view.setInt32(off, 0)
  off += 4
  view.setInt32(off, db.version || 0x00030000)
  off += 4
  off += utf8_encode_into_at_offset('user', buf, off)
  buf[off++] = 0
  off += utf8_encode_into_at_offset(db.user, buf, off)
  buf[off++] = 0
  off += utf8_encode_into_at_offset('database', buf, off)
  buf[off++] = 0
  off += utf8_encode_into_at_offset(db.database, buf, off)
  buf[off++] = 0
  buf[off++] = 0
  view.setInt32(0, off)
  return ptr(buf.slice(0, off))
}

function md5_auth (db, salt) {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  buf[off++] = 112
  const { user, pass } = db
  let hash = md5(encoder.encode(`${pass}${user}`))
  const md5_buf = new Uint8Array(36)
  utf8_encode_into(hash, md5_buf)
  md5_buf.set(salt, 32)
  hash = md5(md5_buf)
  view.setUint32(off, 40)
  off += 4
  off += utf8_encode_into_at_offset(`md5${hash}`, buf, off)
  buf[off++] = 0
  return ptr(buf.slice(0, off))
}

function bind (id, fields = [], formats = [], params = []) {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  const flen = formats.length
  const plen = params.length
  const filen = fields.length
  view.setUint8(off++, 66) // 'B'
  off += 4 // length - will be filled in later
  view.setUint8(off++, 0)
  view.setUint8(off++, id)
  view.setUint8(off++, 0)
  view.setUint16(off, flen)
  off += 2
  for (let i = 0; i < flen; i++) {
    view.setUint16(off, formats[i].format)
    off += 2
  }
  view.setUint16(off, plen)
  off += 2
  for (let i = 0; i < plen; i++) {
    const param = params[i]
    if ((formats[i] || formats[0]).format === 1) {
      view.setUint32(off, 4)
      off += 4
      view.setUint32(off, param)
      off += 4
    } else {
      view.setUint32(off, param.length)
      off += 4
      off += utf8_encode_into_at_offset(param, buf, off)
    }
  }
  if (filen > 0) {
    const format = fields[0].format.format
    let same = true
    for (let i = 1; i < filen; i++) {
      if (fields[i].format.format !== format) {
        same = false
        break
      }
    }
    if (same) {
      view.setUint16(off, 1)
      off += 2
      view.setUint16(off, fields[0].format.format)
      off += 2
    } else {
      view.setUint16(off, filen)
      off += 2
      for (let i = 0; i < filen; i++) {
        view.setUint16(off, fields[i].format.format)
        off += 2
      }
    }
  } else {
    view.setUint16(off, 0)
    off += 2
  }
  view.setUint32(1, (off - 1))
  return ptr(buf.slice(0, off))
}

function prepare (id, sql, formats = []) {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  const flen = formats.length
  const len = 9 + lo.utf8_length(sql) + 1 + (flen * 4)
  view.setUint8(off++, 80) // 'P'
  view.setUint32(off, len - 1)
  off += 4
  buf[off++] = id
  view.setUint8(off++, 0)
  off += utf8_encode_into_at_offset(sql, buf, off)
  view.setUint8(off++, 0)
  view.setUint16(off, flen)
  off += 2
  for (let i = 0; i < flen; i++) {
    view.setUint32(off, formats[i].oid)
    off += 4
  }
  return ptr(buf.slice(0, off))
}

function describe (id) {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  const len = 8
  view.setUint8(off++, 68) // 'D'
  view.setUint32(off, len - 1)
  off += 4
  view.setUint8(off++, 83) // 'S'
  buf[off++] = id
  off += 1
  return ptr(buf.slice(0, off))
}

function exec () {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  const len = 10
  view.setUint8(off++, 69) // 'E'
  view.setUint32(off, len - 1)
  off += 4
  view.setUint8(off++, 0)
  view.setUint32(off, 0)
  off += 4
  return ptr(buf.slice(0, off))
}

function sync () {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  view.setUint8(off++, 83) // 'S'
  view.setUint32(off, 4)
  off += 4
  return ptr(buf.slice(0, off))
}

function flush () {
  let off = 0
  const buf = new Uint8Array(BUFSIZE)
  const view = new DataView(buf.buffer)
  view.setUint8(off++, 72) // 'H'
  view.setUint32(off, 4)
  off += 4
  return ptr(buf.slice(0, off))
}

function exec_query (id, query) {
  const buf = new Uint8Array(BUFSIZE)
  const bind_msg = bind(id, query.fields)
  const exec_msg = exec()
  const sync_msg = sync()
  let off = 0
  for (let i = 0; i < batch_size; i++) {
    buf.set(bind_msg, off)
    off += bind_msg.length
    buf.set(exec_msg, off)
    off += exec_msg.length
  }
  buf.set(sync_msg, off)
  off += sync_msg.length
  return ptr(buf.slice(0, off))
}

function create_pgsocket (fd) {
  const recv_buf = ptr(new Uint8Array(BUFSIZE))
  const recv_view = new DataView(recv_buf.buffer)
  const handlers = (new Array(256)).fill(0).map((v, i) => {
    return (len, off) => {
      console.log(`unexpected message ${i} : len ${len} off ${off}`)
      console.log(dump(recv_buf.subarray(off, off + len)))
    }
  })
  handlers[ParseComplete] = noop
  handlers[BackendKeyData] = noop
  handlers[ParameterStatus] = noop
  handlers[BindComplete] = noop
  handlers[ParameterDescription] = noop
  handlers[RowDescription] = noop
  handlers[DataRow] = (len, off) => {
    const id = recv_view.getInt32(off + 6)
    assert(id)
  }
  handlers[AuthenticationOk] = (len, off) => {
    const method = recv_view.getInt32(off)
    if (method === AuthenticationMD5Password) {
      const auth = md5_auth(db, recv_buf.subarray(off + 4, off + 8))
      stats.send += send2(fd, auth.ptr, auth.length, 0)
    }
  }
  handlers[CommandComplete] = (len, off) => {
    stats.rps++
  }
  handlers[ReadyForQuery] = (len, off) => {
    const p = prepare(fd, fortunes.sql)
    stats.send += send2(fd, p.ptr, p.length, 0)
    const d = describe(fd)
    stats.send += send2(fd, d.ptr, d.length, 0)
    const bound = exec_query(fd, fortunes)
    stats.send += send2(fd, bound.ptr, bound.length, 0)
    handlers[ReadyForQuery] = () => {
      stats.send += send2(fd, bound.ptr, bound.length, 0)
    }
  }

  function parse (bytes) {
    let off = 0
    while (bytes) {
      const type = recv_buf[off]
      const len = recv_view.getInt32(off + 1)
      handlers[type](len, off + 5)
      off += (len + 1)
      if (off === bytes) break
    }
    if (off - bytes > 0) throw new Error(`OOB ${off} : ${bytes}`)
  }

  sockets[fd] = { handlers, parse, buffer: recv_buf, view: recv_view }
}

function on_timer () {
  stats.log()
}

function close_socket (fd) {
  if (fd > 0) {
    loop.remove(fd)
    close(fd)
    stats.conn--
  }
}

function on_socket_event (fd) {
  const sock = sockets[fd]
  if (!sock) {
    close_socket(fd)
    return
  }
  const bytes = recv2(fd, sock.buffer.ptr, BUFSIZE, 0)
  if (bytes > 0) {
    stats.recv += bytes 
    sock.parse(bytes)
    return
  }
  if (bytes < 0 && lo.errno === Blocked) return
  close_socket(fd)
}

function on_socket_connect (fd) {
  assert(loop.modify(fd, on_socket_event, Loop.Readable, close_socket) === 0)
  create_pgsocket(fd)
  const start = startup(db)
  stats.send += send2(fd, start.ptr, start.length, 0)
  stats.conn++
}

function start_client () {
  let fd = 0
  if (type === 'unix') {
    fd = socket(AF_UNIX, SOCK_STREAM, 0)
    assert(fd > 2)
    assert(connect(fd, sockaddr_un(unix_path), 110) === 0 || 
      lo.errno === EINPROGRESS, 'connect', system.SystemError)
    assert(fcntl(fd, O_NONBLOCK, 0))
  } else {
    fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0)
    assert(fd > 2)
    assert(connect(fd, sockaddr_in(address, port), SOCKADDR_LEN) === 0 || 
      lo.errno === EINPROGRESS)
  }
  assert(loop.add(fd, on_socket_connect, Loop.Writable, close_socket) === 0)
}

const noop = (len, off) => {}
const sockets = {}
const fortunes = {
  formats: [],
  name: 'fortunes',
  maxRows: 0,
  params: [],
  sql: 'select id from Fortune',
  fields: [
    { format: BinaryInt, name: 'id' }
  ]
}
const db = {
  hostname: 'tfb-database',
  user: 'benchmarkdbuser',
  pass: 'benchmarkdbpass',
  database: 'hello_world',
  version: 0x00030000,
}
const unix_path = './postgresql/.s.PGSQL.5432'
const hasher = new Digest('md5')
const stats = new Stats()
const BUFSIZE = parseInt(getenv('BUFSIZE') || `${128 * 1024}`, 10);
const address = getenv('ADDRESS') || '127.0.0.1'
const port = parseInt(getenv('PORT') || '5432', 10)
const loop = new Loop()
const timer = new Timer(loop, 1000, on_timer)
const type = lo.args[2] || 'unix'
const nclient = parseInt(lo.args[3] || '3', 10)
const batch_size = parseInt(lo.args[4] || '8', 10)
for (let i = 0; i < nclient; i++) start_client()
while (loop.poll() > 0) {}
timer.close()
