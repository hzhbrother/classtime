import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'classwork.db'))
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

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

export function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      title TEXT,
      note TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      deadline TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      note TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS completions (
      item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

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

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const result = { ...DEFAULT_SETTINGS }
  for (const row of rows) result[row.key] = row.value
  return result
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value ?? ''))
}

export function addLog({ userId = null, username = '', action, detail = '', ip = '' }) {
  db.prepare(
    'INSERT INTO logs (user_id, username, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, username, action, detail, ip, nowIso())
}

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

export function getBoardRow(date) {
  return db.prepare('SELECT * FROM boards WHERE date = ?').get(date)
}

export function ensureBoard(date) {
  let board = getBoardRow(date)
  if (board) return board
  const now = nowIso()
  db.prepare(
    'INSERT INTO boards (date, title, note, published, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(date, '每日作业', '', now, now)
  board = getBoardRow(date)
  addLog({ action: 'board.auto_create', detail: `自动创建 ${date} 的作业板` })
  return board
}

export function copyItems(fromDate, toDate) {
  const from = getBoardRow(fromDate)
  const to = ensureBoard(toDate)
  if (!from) return 0
  const items = db.prepare('SELECT * FROM items WHERE board_id = ? ORDER BY sort, id').all(from.id)
  const now = nowIso()
  let count = 0
  for (const item of items) {
    db.prepare(
      `INSERT INTO items (board_id, subject, content, deadline, priority, note, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(to.id, item.subject, item.content, item.deadline, item.priority, item.note, item.sort, now, now)
    count++
  }
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, to.id)
  return count
}

export function getBoardPayload(date, userId = null, role = 'student') {
  const board = ensureBoard(date)
  const items = db.prepare(
    `SELECT i.*, 
      (SELECT COUNT(*) FROM completions c WHERE c.item_id = i.id) AS done_count
     FROM items i WHERE i.board_id = ? ORDER BY i.sort, i.id`
  ).all(board.id)
  const doneRows = userId
    ? db.prepare('SELECT item_id FROM completions WHERE user_id = ?').all(userId)
    : []
  const doneSet = new Set(doneRows.map((r) => Number(r.item_id)))
  const studentCount = Number(
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND disabled = 0").get().n
  )
  const totalDone = items.reduce((acc, i) => acc + Number(i.done_count), 0)
  const capacity = items.length * Math.max(studentCount, 1)
  return {
    date,
    title: board.title,
    note: board.note,
    published: !!board.published,
    updatedAt: board.updated_at,
    studentCount,
    totalDone,
    progress: capacity === 0 ? 0 : Math.round((totalDone / capacity) * 100),
    items: items.map((i) => ({
      id: Number(i.id),
      subject: i.subject,
      content: i.content,
      deadline: i.deadline,
      priority: i.priority,
      note: i.note,
      sort: Number(i.sort),
      doneCount: Number(i.done_count),
      done: doneSet.has(Number(i.id))
    }))
  }
}

export function seedIfEmpty() {
  const userCount = Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n)
  const now = nowIso()

  if (userCount === 0) {
    const users = [
      ['admin', 'admin123', '林知远 · 超级管理员', 'super_admin', '#4f46e5', '高二(3)班'],
      ['teacher', 'teacher123', '王舒宁 · 班主任', 'teacher', '#0891b2', '高二(3)班'],
      ['student', 'student123', '陈一鸣', 'student', '#f59e0b', '高二(3)班'],
      ['display', 'display123', '班级大屏', 'display', '#7c3aed', '高二(3)班']
    ]
    const stmt = db.prepare(
      'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    for (const [username, password, name, role, color, className] of users) {
      stmt.run(username, hashPassword(password), name, role, color, className, now)
    }
  }

  const settingCount = Number(db.prepare('SELECT COUNT(*) AS n FROM settings').get().n)
  if (settingCount === 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) setSetting(key, value)
  }

  const boardCount = Number(db.prepare('SELECT COUNT(*) AS n FROM boards').get().n)
  if (boardCount === 0) {
    const today = dateStr()
    const yesterday = addDays(today, -1)
    const seedBoard = (date, items) => {
      const board = ensureBoard(date)
      const stmt = db.prepare(
        `INSERT INTO items (board_id, subject, content, deadline, priority, note, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      items.forEach((it, idx) => {
        stmt.run(board.id, it[0], it[1], it[2], it[3] || 'normal', it[4] || '', idx, now, now)
      })
    }
    seedBoard(yesterday, [
      ['语文', '整理《赤壁赋》通假字与古今异义，完成课后练习 P38。', '21:00'],
      ['数学', '完成 3.1 节练习册 1-15 题，订正周测错题。', '21:30'],
      ['英语', '背诵 Unit 3 单词，完成语法填空两篇。', '20:30'],
      ['物理', '复习牛顿第二定律，整理错题本。', '22:00'],
      ['化学', '完成《化学反应原理》第三章课后题。', '21:00']
    ])
    seedBoard(today, [
      ['语文', '完成《赤壁赋》课后练习 P42-43，并背诵全文第三段。', '21:00', 'normal', '明早课前抽查背诵'],
      ['数学', '完成练习册 3.2 节 1-12 题，订正周测错题并写清错因。', '21:30', 'urgent', '明天第一节讲评'],
      ['英语', '背诵 Unit 4 单词表，完成阅读训练两篇（限时 25 分钟）。', '20:30'],
      ['物理', '完成实验报告：测量小灯泡的伏安特性曲线，画出 U-I 图像。', '22:00'],
      ['化学', '完成《化学反应原理》第四章选择题 1-10，标注不确定的选项。', '21:00'],
      ['生物', '整理「细胞呼吸」知识点思维导图，A4 纸手绘。', '20:00']
    ])
    db.prepare('UPDATE boards SET title = ?, note = ? WHERE date = ?').run(
      '今日作业',
      '请同学们按时完成，并在班级作业云上打卡确认。',
      today
    )
  }

  const noticeCount = Number(db.prepare('SELECT COUNT(*) AS n FROM notices').get().n)
  if (noticeCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO notices (title, content, level, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    )
    stmt.run('班级大扫除', '明天下午第三节课后举行班级大扫除，请各小组提前分工，值日组留到最后检查。', 'info', now, now)
    stmt.run('本周家长会', '本周五 18:30 在本班教室召开家长会，请同学们提前转告家长。', 'warning', now, now)
    stmt.run('降温提醒', '近期气温下降明显，请同学们注意添衣，跑操照常进行。', 'info', now, now)
  }

  const deviceCount = Number(db.prepare('SELECT COUNT(*) AS n FROM devices').get().n)
  if (deviceCount === 0) {
    const teacherId = db.prepare("SELECT id FROM users WHERE username = 'teacher'").get()?.id
    const studentId = db.prepare("SELECT id FROM users WHERE username = 'student'").get()?.id
    const displayId = db.prepare("SELECT id FROM users WHERE username = 'display'").get()?.id
    const stmt = db.prepare(
      `INSERT INTO devices (uuid, name, user_id, identity, status, os, browser, platform, screen, device_type, ip, ua, last_seen, created_at, bound_at)
       VALUES (?, ?, ?, ?, 'bound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    stmt.run('demo-display-lobby', '教室大屏 · 鸿合', displayId, 'display', 'Android 11', 'Chrome 118', 'Android', '1920x1080', 'display', '192.168.1.23', 'Mozilla/5.0 (Linux; Android 11) Chrome/118.0', new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), now, now)
    stmt.run('demo-teacher-laptop', '王老师 · MacBook Air', teacherId, 'teacher', 'macOS 15.1', 'Safari 18', 'MacIntel', '1512x982', 'desktop', '192.168.1.16', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1', new Date(Date.now() - 1000 * 60 * 42).toISOString(), now, now)
    stmt.run('demo-student-phone', '陈一鸣 · iPhone 15', studentId, 'student', 'iOS 18.1', 'Safari', 'iPhone', '393x852', 'mobile', '192.168.1.77', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1', new Date(Date.now() - 1000 * 60 * 8).toISOString(), now, now)
  }
}
