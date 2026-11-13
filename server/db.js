import { Pool } from 'pg'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/* ------------------------------------------------------------------ */
/* 连接池（Neon / 任意 PostgreSQL）                                     */
/* ------------------------------------------------------------------ */

let pool = null

function createPool() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) {
    throw new Error('缺少 DATABASE_URL（或 POSTGRES_URL）环境变量，请配置 Neon / Supabase 的 PostgreSQL 连接串')
  }
  const parsed = new URL(url)
  const sslmode = parsed.searchParams.get('sslmode')
  parsed.searchParams.delete('sslmode')
  const isLocal = /localhost|127\.0\.0\.1/.test(parsed.hostname)
  const ssl = sslmode === 'disable' || (isLocal && !sslmode) ? false : { rejectUnauthorized: false }
  return new Pool({
    connectionString: parsed.toString(),
    ssl,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  })
}

function getPool() {
  if (!pool) {
    pool = createPool()
    pool.on('error', (err) => console.error('[pg] idle client error', err.message))
  }
  return pool
}

/** 把 SQLite 风格的 ? 占位符转成 PostgreSQL 的 $1/$2 */
function toPg(text) {
  let index = 0
  return text.replace(/\?/g, () => `$${++index}`)
}

export const db = {
  prepare(text) {
    const sql = toPg(text)
    return {
      get: (...params) => getPool().query(sql, params).then((r) => r.rows[0]),
      all: (...params) => getPool().query(sql, params).then((r) => r.rows),
      run: (...params) =>
        getPool().query(sql, params).then((r) => ({
          changes: r.rowCount,
          lastInsertRowid: r.rows[0]?.id ?? null
        }))
    }
  },
  exec: (text) => getPool().query(text)
}

/* ------------------------------------------------------------------ */
/* 时间工具                                                             */
/* ------------------------------------------------------------------ */

export function nowIso() {
  return new Date().toISOString()
}

/** 以 Asia/Shanghai 为准的日期字符串 YYYY-MM-DD */
export function dateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

/** 以 Asia/Shanghai 为准的时间 HH:mm */
export function timeStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
}

export function addDays(dateText, n) {
  const [y, m, d] = dateText.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* 密码                                                                 */
/* ------------------------------------------------------------------ */

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const candidate = scryptSync(String(password), salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

/* ------------------------------------------------------------------ */
/* 建表                                                                 */
/* ------------------------------------------------------------------ */

export async function createSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      class_name TEXT DEFAULT '高二(3)班',
      color TEXT DEFAULT '#4f46e5',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_uuid TEXT,
      ip TEXT,
      ua TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT,
      user_id INTEGER,
      identity TEXT NOT NULL DEFAULT 'unassigned',
      status TEXT NOT NULL DEFAULT 'pending',
      os TEXT,
      browser TEXT,
      platform TEXT,
      screen TEXT,
      device_type TEXT,
      ip TEXT,
      ua TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL,
      bound_at TEXT
    );

    CREATE TABLE IF NOT EXISTS boards (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      title TEXT,
      note TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      deadline TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      note TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      data BYTEA NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      level TEXT NOT NULL DEFAULT 'info',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_board ON items (board_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_item ON attachments (item_id);
    CREATE INDEX IF NOT EXISTS idx_completions_user ON completions (user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  `)
}

/* ------------------------------------------------------------------ */
/* 设置                                                                 */
/* ------------------------------------------------------------------ */

export const DEFAULT_SETTINGS = {
  site_name: '班级作业云',
  class_name: '高二(3)班',
  rollover_time: '00:05',
  auto_sync_seconds: '30',
  allow_register: '1',
  allow_public_display: '1',
  auto_carry: '0',
  display_motto: '把今天的作业，变成明天的底气。'
}

export async function getSettings() {
  const rows = await db.prepare('SELECT key, value FROM settings').all()
  const result = { ...DEFAULT_SETTINGS }
  for (const row of rows) result[row.key] = row.value
  return result
}

export async function setSetting(key, value) {
  await db
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
    )
    .run(key, String(value ?? ''))
}

export async function addLog({ userId = null, username = '', action, detail = '', ip = '' }) {
  await db
    .prepare('INSERT INTO logs (user_id, username, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, username, action, detail, ip, nowIso())
}

/* ------------------------------------------------------------------ */
/* 行 -> API 对象                                                       */
/* ------------------------------------------------------------------ */

export function toUser(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    username: row.username,
    name: row.name,
    role: row.role,
    className: row.class_name,
    color: row.color,
    disabled: !!row.disabled,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  }
}

export function toDevice(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    uuid: row.uuid,
    name: row.name,
    userId: row.user_id === null ? null : Number(row.user_id),
    userName: row.user_name || null,
    identity: row.identity,
    status: row.status,
    os: row.os,
    browser: row.browser,
    platform: row.platform,
    screen: row.screen,
    deviceType: row.device_type,
    ip: row.ip,
    ua: row.ua,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    boundAt: row.bound_at
  }
}

/* ------------------------------------------------------------------ */
/* 作业板                                                               */
/* ------------------------------------------------------------------ */

export function getBoardRow(date) {
  return db.prepare('SELECT * FROM boards WHERE date = ?').get(date)
}

export async function ensureBoard(date) {
  const existing = await getBoardRow(date)
  if (existing) return existing
  const now = nowIso()
  const info = await db
    .prepare(
      'INSERT INTO boards (date, title, note, published, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT (date) DO NOTHING'
    )
    .run(date, '每日作业', '', now, now)
  if (info.changes > 0) {
    await addLog({ action: 'board.auto_create', detail: `自动创建 ${date} 的作业板` })
  }
  return getBoardRow(date)
}

export async function copyItems(fromDate, toDate) {
  const from = await getBoardRow(fromDate)
  const to = await ensureBoard(toDate)
  if (!from) return 0
  const items = await db.prepare('SELECT * FROM items WHERE board_id = ? ORDER BY sort, id').all(from.id)
  const now = nowIso()
  let count = 0
  for (const item of items) {
    await db
      .prepare(
        `INSERT INTO items (board_id, subject, content, deadline, priority, note, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(to.id, item.subject, item.content, item.deadline, item.priority, item.note, item.sort, now, now)
    count++
  }
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, to.id)
  return count
}

export async function getBoardPayload(date, userId = null, role = 'student') {
  const board = await ensureBoard(date)
  const [items, students, completionRows, attachmentRows] = await Promise.all([
    db.prepare('SELECT * FROM items WHERE board_id = ? ORDER BY sort, id').all(board.id),
    db.prepare("SELECT id, name, class_name FROM users WHERE role = 'student' AND disabled = 0 ORDER BY id").all(),
    db.prepare(
      `SELECT c.item_id, c.user_id FROM completions c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = c.user_id AND u.role = 'student' AND u.disabled = 0
       WHERE i.board_id = ?`
    ).all(board.id),
    db.prepare(
      `SELECT a.id, a.item_id, a.filename, a.mime, a.size FROM attachments a
       JOIN items i ON i.id = a.item_id WHERE i.board_id = ? ORDER BY a.id`
    ).all(board.id)
  ])

  const submittedByItem = new Map()
  for (const row of completionRows) {
    const itemId = Number(row.item_id)
    if (!submittedByItem.has(itemId)) submittedByItem.set(itemId, new Set())
    submittedByItem.get(itemId).add(Number(row.user_id))
  }
  const attachmentsByItem = new Map()
  for (const row of attachmentRows) {
    const itemId = Number(row.item_id)
    if (!attachmentsByItem.has(itemId)) attachmentsByItem.set(itemId, [])
    attachmentsByItem.get(itemId).push({
      id: Number(row.id),
      filename: row.filename,
      mime: row.mime,
      size: Number(row.size)
    })
  }

  const studentCount = students.length
  const totalDone = items.reduce((acc, item) => acc + (submittedByItem.get(Number(item.id))?.size || 0), 0)
  const capacity = items.length * studentCount
  const previousDate = addDays(date, -1)
  const previousBoard = await getBoardRow(previousDate)
  const previousItems = previousBoard
    ? await db.prepare(
        `SELECT i.id, i.subject,
          (SELECT COUNT(*) FROM completions c JOIN users u ON u.id = c.user_id
           WHERE c.item_id = i.id AND u.role = 'student' AND u.disabled = 0) AS done_count
         FROM items i WHERE i.board_id = ? ORDER BY i.sort, i.id`
      ).all(previousBoard.id)
    : []

  return {
    date,
    title: board.title,
    note: board.note,
    published: !!board.published,
    updatedAt: board.updated_at,
    studentCount,
    totalDone,
    progress: capacity === 0 ? 0 : Math.round((totalDone / capacity) * 100),
    previousDay: {
      date: previousDate,
      items: previousItems.map((item) => ({
        id: Number(item.id),
        subject: item.subject,
        doneCount: Number(item.done_count),
        studentCount
      }))
    },
    items: items.map((item) => {
      const id = Number(item.id)
      const submittedIds = submittedByItem.get(id) || new Set()
      const submittedStudents = students
        .filter((student) => submittedIds.has(Number(student.id)))
        .map((student) => ({ id: Number(student.id), name: student.name, className: student.class_name }))
      const pendingStudents = students
        .filter((student) => !submittedIds.has(Number(student.id)))
        .map((student) => ({ id: Number(student.id), name: student.name, className: student.class_name }))
      return {
        id,
        subject: item.subject,
        content: item.content,
        // 旧版具体时刻没有对应课时，按新建作业的默认第一节课展示
        deadline: /^第(?:[1-9]|1[0-2])节课$/.test(item.deadline || '') ? item.deadline : item.deadline ? '第1节课' : '',
        priority: item.priority,
        note: item.note,
        sort: Number(item.sort),
        doneCount: submittedStudents.length,
        done: userId ? submittedIds.has(Number(userId)) : false,
        submittedStudents,
        pendingStudents,
        attachments: attachmentsByItem.get(id) || []
      }
    })
  }
}

/* ------------------------------------------------------------------ */
/* 初始化与种子数据                                                     */
/* ------------------------------------------------------------------ */

export async function seedIfEmpty() {
  const now = nowIso()

  // 全新数据库只创建超级管理员，其余账号、作业、公告、设备全部由管理员自行创建
  const userCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n)
  if (userCount === 0) {
    await db
      .prepare(
        'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (username) DO NOTHING'
      )
      .run('admin', hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin123'), '超级管理员', 'super_admin', '#4f46e5', DEFAULT_SETTINGS.class_name, now)
  }

  const settingCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM settings').get()).n)
  if (settingCount === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await setSetting(key, value)
  }
}

/* ------------------------------------------------------------------ */
/* 惰性初始化（Serverless 下每个实例复用同一个 Promise）                 */
/* ------------------------------------------------------------------ */

let readyPromise = null

export function initDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      // Transaction pooler 不保证会话级锁的释放；事务锁会在提交、回滚或断连时自动释放
      const client = await getPool().connect()
      let inTransaction = false
      try {
        await client.query('BEGIN')
        inTransaction = true
        await client.query('SELECT pg_advisory_xact_lock(728191)')
        await createSchema()
        await seedIfEmpty()
        await client.query('COMMIT')
        inTransaction = false
      } catch (err) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    })().catch((err) => {
      readyPromise = null
      throw err
    })
  }
  return readyPromise
}
