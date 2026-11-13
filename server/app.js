import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import {
  db,
  getSettings,
  setSetting,
  addLog,
  nowIso,
  dateStr,
  timeStr,
  addDays,
  hashPassword,
  verifyPassword,
  toUser,
  toDevice,
  ensureBoard,
  getBoardRow,
  copyItems,
  getBoardPayload,
  DEFAULT_SETTINGS
} from './db.js'

export const app = express()
const DIST_DIR = path.resolve(process.cwd(), 'dist')
const SESSION_DAYS = 30
const IDENTITIES = ['unassigned', 'teacher', 'student', 'display', 'guest']
const ROLES = ['super_admin', 'teacher', 'student', 'display']
const DEVICE_STATUS = ['pending', 'bound', 'revoked']
const REALTIME_ENABLED = !process.env.VERCEL

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '6mb' }))

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function h(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next)
      if (result && typeof result.catch === 'function') result.catch(next)
    } catch (err) {
      next(err)
    }
  }
}

function clientIp(req) {
  const raw = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
  const ip = String(raw).split(',')[0].trim()
  return ip.replace(/^::ffff:/, '')
}

function readCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function isSecureRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
}

function setCookie(req, res, token) {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `cb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
  )
}

function clearCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader('Set-Cookie', `cb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

function parseUA(ua = '') {
  let os = '未知系统'
  let browser = '未知浏览器'
  let deviceType = 'desktop'
  if (/Windows NT 10|Windows NT 11/.test(ua)) os = 'Windows 10/11'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/HarmonyOS|OpenHarmony/.test(ua)) os = 'HarmonyOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/MicroMessenger/.test(ua)) browser = '微信内置浏览器'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    deviceType = 'tablet'
  } else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua)) {
    deviceType = 'mobile'
  }
  return { os, browser, deviceType }
}

function identityForRole(role) {
  if (role === 'teacher' || role === 'super_admin') return 'teacher'
  if (role === 'student') return 'student'
  if (role === 'display') return 'display'
  return 'unassigned'
}

async function publicSettings() {
  const s = await getSettings()
  return {
    siteName: s.site_name,
    className: s.class_name,
    allowRegister: s.allow_register === '1',
    allowPublicDisplay: s.allow_public_display === '1',
    autoSyncSeconds: Number(s.auto_sync_seconds) || 30,
    displayMotto: s.display_motto,
    rolloverTime: s.rollover_time
  }
}

/** 请求设备信息落库（每个 API 请求调用） */
async function touchDevice(req) {
  const uuid = String(req.headers['x-device-id'] || '').trim()
  if (!uuid || uuid.length > 120) return null
  const ua = String(req.headers['user-agent'] || '')
  const fallback = parseUA(ua)
  const ip = clientIp(req)
  const now = nowIso()

  let row = await db.prepare('SELECT * FROM devices WHERE uuid = ?').get(uuid)
  const os = String(req.headers['x-device-os'] || '').slice(0, 60) ||
    (fallback.os !== '未知系统' ? fallback.os : row?.os || fallback.os)
  const browser = String(req.headers['x-device-browser'] || '').slice(0, 60) ||
    (fallback.browser !== '未知浏览器' ? fallback.browser : row?.browser || fallback.browser)
  const platform = String(req.headers['x-device-platform'] || '').slice(0, 60) || row?.platform || ''
  const screen = String(req.headers['x-device-screen'] || '').slice(0, 40) || row?.screen || ''
  const deviceType = String(req.headers['x-device-type'] || '').slice(0, 20) || fallback.deviceType || row?.device_type || 'desktop'
  if (!row) {
    await db
      .prepare(
        `INSERT INTO devices (uuid, name, user_id, identity, status, os, browser, platform, screen, device_type, ip, ua, last_seen, created_at)
         VALUES (?, ?, NULL, 'unassigned', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(uuid, `${os} · ${browser}`, os, browser, platform, screen, deviceType, ip, ua, now, now)
    row = await db.prepare('SELECT * FROM devices WHERE uuid = ?').get(uuid)
  } else {
    if (row.status === 'revoked') {
      // 已注销设备仍记录最后一次在线信息，但不可使用
      await db.prepare('UPDATE devices SET last_seen = ?, ip = ? WHERE id = ?').run(now, ip, row.id)
      return { row, revoked: true }
    }
    await db
      .prepare(
        `UPDATE devices SET os = ?, browser = ?, platform = ?, screen = ?, device_type = ?, ip = ?, ua = ?, last_seen = ?,
          name = CASE WHEN name IS NULL OR name = '' THEN ? ELSE name END
         WHERE id = ?`
      )
      .run(os, browser, platform, screen, deviceType, ip, ua, now, `${os} · ${browser}`, row.id)
    row = await db.prepare('SELECT * FROM devices WHERE uuid = ?').get(uuid)
  }
  return { row, revoked: false }
}

async function bindDevice(uuid, user, force = false) {
  if (!uuid || !user) return null
  const row = await db.prepare('SELECT * FROM devices WHERE uuid = ?').get(uuid)
  if (!row) return null
  if (row.status === 'revoked' && !force) return row
  const identity = row.identity === 'unassigned' ? identityForRole(user.role) : row.identity
  await db
    .prepare(
      `UPDATE devices SET user_id = ?, identity = ?, status = 'bound', bound_at = COALESCE(bound_at, ?) WHERE id = ?`
    )
    .run(user.id, identity, nowIso(), row.id)
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(row.id)
}

function deviceWithUser(id) {
  return db
    .prepare(
      `SELECT d.*, u.name AS user_name FROM devices d LEFT JOIN users u ON u.id = d.user_id WHERE d.id = ?`
    )
    .get(id)
}

async function currentUser(req) {
  const token = readCookies(req).cb_session
  if (!token) return null
  const session = await db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
  if (!user || user.disabled) return null
  return { ...toUser(user), sessionToken: token }
}

async function createSession(user, deviceUuid, req) {
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000)
  await db
    .prepare(
      'INSERT INTO sessions (token, user_id, device_uuid, ip, ua, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(token, user.id, deviceUuid || '', clientIp(req), String(req.headers['user-agent'] || ''), now.toISOString(), expires.toISOString())
  return token
}

/* ------------------------------------------------------------------ */
/* 实时同步 (SSE，仅本地/常驻部署可用)                                  */
/* ------------------------------------------------------------------ */

const sseClients = new Set()

function broadcast(type, data = {}) {
  if (!REALTIME_ENABLED) return
  const payload = `data: ${JSON.stringify({ type, data, at: nowIso() })}\n\n`
  for (const res of sseClients) {
    try {
      res.write(payload)
    } catch {
      sseClients.delete(res)
    }
  }
}

app.get('/api/capabilities', (req, res) => {
  res.json({ realtime: REALTIME_ENABLED, polling: true, version: '2.0.0' })
})

app.get('/api/events', (req, res) => {
  if (!REALTIME_ENABLED) {
    return res.status(204).set('Cache-Control', 'no-store').end()
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('retry: 3000\n\n')
  res.write(`data: ${JSON.stringify({ type: 'hello', at: nowIso() })}\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

/* ------------------------------------------------------------------ */
/* 中间件：设备识别 + 登录态                                            */
/* ------------------------------------------------------------------ */

app.use('/api', h(async (req, res, next) => {
  const touch = await touchDevice(req)
  req.deviceTouch = touch
  req.currentDevice = touch?.row || null
  req.user = await currentUser(req)
  next()
}))

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' })
  next()
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '请先登录' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '没有操作权限' })
    next()
  }
}

const canEditBoard = requireRole('super_admin', 'teacher')
const isAdmin = requireRole('super_admin')

/* ------------------------------------------------------------------ */
/* 公共接口                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/health', (req, res) => res.json({ ok: true, date: dateStr(), time: timeStr() }))

app.get('/api/settings/public', h(async (req, res) => res.json(await publicSettings())))

function safeUser(user) {
  if (!user) return null
  const { sessionToken, ...rest } = user
  return rest
}

app.get('/api/auth/me', h(async (req, res) => {
  const device = req.currentDevice ? await deviceWithUser(req.currentDevice.id) : null
  res.json({
    user: safeUser(req.user),
    device: device ? toDevice(device) : null,
    settings: await publicSettings()
  })
}))

app.post('/api/auth/login', h(async (req, res) => {
  const { username = '', password = '' } = req.body || {}
  const row = await db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim())
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: '账号或密码不正确' })
  }
  if (row.disabled) return res.status(403).json({ error: '该账号已被停用，请联系管理员' })
  if (req.deviceTouch?.revoked) {
    return res.status(403).json({ error: '当前设备已被管理员注销，无法登录' })
  }
  const user = toUser(row)
  const token = await createSession(user, req.currentDevice?.uuid, req)
  setCookie(req, res, token)
  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id)
  let deviceRow = req.currentDevice
  if (deviceRow) deviceRow = await bindDevice(deviceRow.uuid, user)
  await addLog({ userId: user.id, username: user.username, action: 'auth.login', detail: '登录系统', ip: clientIp(req) })
  broadcast('devices', { reason: 'login' })
  res.json({ user, device: deviceRow ? toDevice(await deviceWithUser(deviceRow.id)) : null, settings: await publicSettings() })
}))

app.post('/api/auth/register', h(async (req, res) => {
  const settings = await getSettings()
  if (settings.allow_register !== '1') return res.status(403).json({ error: '管理员已关闭自助注册' })
  const { username = '', password = '', name = '', role = 'student' } = req.body || {}
  const uname = String(username).trim()
  const displayName = String(name).trim()
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ error: '账号需为 3-20 位字母、数字或下划线' })
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  if (!displayName || displayName.length > 20) return res.status(400).json({ error: '请填写昵称（20 字以内）' })
  if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: '注册身份不合法' })
  if (await db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
    return res.status(409).json({ error: '该账号已被注册' })
  }
  const colors = ['#4f46e5', '#0891b2', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']
  const color = colors[Math.floor(Math.random() * colors.length)]
  const isFirstUser = Number((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n) === 0
  const finalRole = isFirstUser ? 'super_admin' : role
  const info = await db.prepare(
    'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  ).run(uname, hashPassword(password), displayName, finalRole, color, settings.class_name, nowIso())
  const user = toUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)))
  const token = await createSession(user, req.currentDevice?.uuid, req)
  setCookie(req, res, token)
  let deviceRow = req.currentDevice
  if (deviceRow && !req.deviceTouch?.revoked) deviceRow = await bindDevice(deviceRow.uuid, user)
  await addLog({ userId: user.id, username: user.username, action: 'auth.register', detail: `自助注册为 ${finalRole}`, ip: clientIp(req) })
  broadcast('users', { reason: 'register' })
  res.status(201).json({ user, device: deviceRow ? toDevice(await deviceWithUser(deviceRow.id)) : null, settings: await publicSettings() })
}))

app.post('/api/auth/logout', h(async (req, res) => {
  if (req.user) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user.sessionToken)
    await addLog({ userId: req.user.id, username: req.user.username, action: 'auth.logout', detail: '退出登录', ip: clientIp(req) })
  }
  clearCookie(req, res)
  res.json({ ok: true })
}))

app.patch('/api/auth/profile', requireAuth, h(async (req, res) => {
  const { name, oldPassword, newPassword } = req.body || {}
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (name !== undefined) {
    const n = String(name).trim()
    if (!n || n.length > 20) return res.status(400).json({ error: '昵称需为 1-20 个字符' })
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, req.user.id)
  }
  if (newPassword) {
    if (!verifyPassword(oldPassword || '', row.password_hash)) return res.status(400).json({ error: '原密码不正确' })
    if (String(newPassword).length < 6) return res.status(400).json({ error: '新密码至少 6 位' })
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id)
  }
  await addLog({ userId: req.user.id, username: req.user.username, action: 'auth.profile', detail: '更新个人资料', ip: clientIp(req) })
  const user = toUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id))
  res.json({ user })
}))

/* ------------------------------------------------------------------ */
/* 作业板                                                              */
/* ------------------------------------------------------------------ */

function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d))
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const MAX_ATTACHMENT_BATCH_BYTES = 3 * 1024 * 1024

function parseAttachments(input) {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > 10) throw httpError(400, '每次最多上传 10 个附件')
  let totalBytes = 0
  return input.map((file) => {
    const filename = String(file?.filename || file?.name || '').split(/[\\/]/).pop().replace(/[\x00-\x1f]/g, '').trim().slice(0, 120)
    const mime = String(file?.mime || file?.type || 'application/octet-stream').slice(0, 120)
    const base64 = String(file?.data || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
    if (!filename || !base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
      throw httpError(400, '附件内容不完整，请重新选择文件')
    }
    const data = Buffer.from(base64, 'base64')
    totalBytes += data.length
    if (!data.length || totalBytes > MAX_ATTACHMENT_BATCH_BYTES) {
      throw httpError(400, '单次上传的附件合计不能超过 3 MB')
    }
    return { filename, mime, data }
  })
}

async function insertAttachments(itemId, files) {
  for (const file of files) {
    await db.prepare(
      'INSERT INTO attachments (item_id, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(itemId, file.filename, file.mime, file.data.length, file.data, nowIso())
  }
}

app.get('/api/board', h(async (req, res) => {
  const settings = await getSettings()
  const date = validDate(req.query.date) ? req.query.date : dateStr()
  if (!req.user && settings.allow_public_display !== '1') {
    return res.status(401).json({ error: '请先登录' })
  }
  const payload = await getBoardPayload(date, req.user?.id || null, req.user?.role || 'guest')
  res.json({ ...payload, canEdit: ['super_admin', 'teacher'].includes(req.user?.role) })
}))

app.get('/api/board/history', requireAuth, h(async (req, res) => {
  const rows = await db.prepare(
    `SELECT b.date, b.published, COUNT(i.id) AS item_count
     FROM boards b LEFT JOIN items i ON i.board_id = b.id
     GROUP BY b.id, b.date, b.published ORDER BY b.date DESC LIMIT 21`
  ).all()
  res.json(rows.map((r) => ({ date: r.date, published: !!r.published, itemCount: Number(r.item_count) })))
}))

app.put('/api/board/:date', canEditBoard, h(async (req, res) => {
  const date = req.params.date
  if (!validDate(date)) return res.status(400).json({ error: '日期格式不正确' })
  const board = await ensureBoard(date)
  const { title, note, published } = req.body || {}
  await db.prepare(
    'UPDATE boards SET title = ?, note = ?, published = ?, updated_at = ? WHERE id = ?'
  ).run(
    title !== undefined ? String(title).slice(0, 60) : board.title,
    note !== undefined ? String(note).slice(0, 300) : board.note,
    published !== undefined ? (published ? 1 : 0) : board.published,
    nowIso(),
    board.id
  )
  await addLog({ userId: req.user.id, username: req.user.username, action: 'board.update', detail: `更新 ${date} 作业板设置`, ip: clientIp(req) })
  broadcast('board', { date })
  res.json(await getBoardPayload(date, req.user.id, req.user.role))
}))

app.post('/api/board/:date/items', canEditBoard, h(async (req, res) => {
  const date = req.params.date
  if (!validDate(date)) return res.status(400).json({ error: '日期格式不正确' })
  const { subject = '', content = '', deadline = '', priority = 'normal', note = '' } = req.body || {}
  if (!String(subject).trim()) return res.status(400).json({ error: '请填写科目' })
  if (!String(content).trim()) return res.status(400).json({ error: '请填写作业内容' })
  if (!['normal', 'urgent'].includes(priority)) return res.status(400).json({ error: '优先级不合法' })
  const files = parseAttachments(req.body?.attachments)
  const board = await ensureBoard(date)
  const maxSort = Number((await db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM items WHERE board_id = ?').get(board.id)).m)
  const now = nowIso()
  const info = await db.prepare(
    `INSERT INTO items (board_id, subject, content, deadline, priority, note, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).run(board.id, String(subject).trim().slice(0, 20), String(content).trim().slice(0, 1000), String(deadline).trim().slice(0, 20), priority, String(note).slice(0, 300), maxSort + 1, now, now)
  await insertAttachments(Number(info.lastInsertRowid), files)
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'item.create', detail: `为 ${date} 添加 ${subject} 作业`, ip: clientIp(req) })
  broadcast('board', { date })
  res.status(201).json(await getBoardPayload(date, req.user.id, req.user.role))
}))

app.patch('/api/items/:id', canEditBoard, h(async (req, res) => {
  const id = Number(req.params.id)
  const item = await db.prepare('SELECT i.*, b.date, b.id AS board_id FROM items i JOIN boards b ON b.id = i.board_id WHERE i.id = ?').get(id)
  if (!item) return res.status(404).json({ error: '作业不存在' })
  const { subject, content, deadline, priority, note } = req.body || {}
  if (priority !== undefined && !['normal', 'urgent'].includes(priority)) {
    return res.status(400).json({ error: '优先级不合法' })
  }
  const files = parseAttachments(req.body?.attachments)
  const removeIds = req.body?.removeAttachmentIds === undefined
    ? []
    : Array.isArray(req.body.removeAttachmentIds)
      ? req.body.removeAttachmentIds.map(Number).filter(Number.isInteger)
      : null
  if (!removeIds) return res.status(400).json({ error: '附件删除列表不正确' })
  const now = nowIso()
  await db.prepare(
    `UPDATE items SET subject = ?, content = ?, deadline = ?, priority = ?, note = ?, updated_at = ? WHERE id = ?`
  ).run(
    subject !== undefined ? String(subject).slice(0, 20) : item.subject,
    content !== undefined ? String(content).slice(0, 1000) : item.content,
    deadline !== undefined ? String(deadline).trim().slice(0, 20) : item.deadline,
    priority !== undefined ? priority : item.priority,
    note !== undefined ? String(note).slice(0, 300) : item.note,
    now,
    id
  )
  for (const attachmentId of removeIds) {
    await db.prepare('DELETE FROM attachments WHERE id = ? AND item_id = ?').run(attachmentId, id)
  }
  await insertAttachments(id, files)
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, item.board_id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'item.update', detail: `修改 ${item.date} 的 ${item.subject} 作业`, ip: clientIp(req) })
  broadcast('board', { date: item.date })
  res.json(await getBoardPayload(item.date, req.user.id, req.user.role))
}))

app.delete('/api/items/:id', canEditBoard, h(async (req, res) => {
  const id = Number(req.params.id)
  const item = await db.prepare('SELECT i.*, b.date FROM items i JOIN boards b ON b.id = i.board_id WHERE i.id = ?').get(id)
  if (!item) return res.status(404).json({ error: '作业不存在' })
  await db.prepare('DELETE FROM items WHERE id = ?').run(id)
  await db.prepare('DELETE FROM completions WHERE item_id = ?').run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'item.delete', detail: `删除 ${item.date} 的 ${item.subject} 作业`, ip: clientIp(req) })
  broadcast('board', { date: item.date })
  res.json(await getBoardPayload(item.date, req.user.id, req.user.role))
}))

app.get('/api/attachments/:id/download', h(async (req, res) => {
  const settings = await getSettings()
  if (!req.user && settings.allow_public_display !== '1') return res.status(401).json({ error: '请先登录' })
  const row = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: '附件不存在或已删除' })
  res.setHeader('Content-Type', row.mime || 'application/octet-stream')
  res.setHeader('Content-Length', row.data.length)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(row.data)
}))

app.put('/api/items/:id/submissions/:studentId', canEditBoard, h(async (req, res) => {
  const id = Number(req.params.id)
  const studentId = Number(req.params.studentId)
  const item = await db.prepare('SELECT i.*, b.date, b.id AS board_id FROM items i JOIN boards b ON b.id = i.board_id WHERE i.id = ?').get(id)
  if (!item) return res.status(404).json({ error: '作业不存在' })
  const student = await db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'student' AND disabled = 0").get(studentId)
  if (!student) return res.status(404).json({ error: '学生不存在或已停用' })
  const submitted = req.body?.submitted !== false
  if (submitted) {
    await db.prepare('INSERT INTO completions (item_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(id, studentId, nowIso())
  } else {
    await db.prepare('DELETE FROM completions WHERE item_id = ? AND user_id = ?').run(id, studentId)
  }
  await db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(nowIso(), item.board_id)
  broadcast('board', { date: item.date })
  res.json(await getBoardPayload(item.date, req.user.id, req.user.role))
}))

app.post('/api/board/:date/carry', canEditBoard, h(async (req, res) => {
  const date = req.params.date
  if (!validDate(date)) return res.status(400).json({ error: '日期格式不正确' })
  const from = addDays(date, -1)
  const count = await copyItems(from, date)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'board.carry', detail: `从 ${from} 复制 ${count} 条作业到 ${date}`, ip: clientIp(req) })
  broadcast('board', { date })
  res.json({ copied: count, board: await getBoardPayload(date, req.user.id, req.user.role) })
}))

/* ------------------------------------------------------------------ */
/* 公告                                                                */
/* ------------------------------------------------------------------ */

app.get('/api/notices', h(async (req, res) => {
  const all = req.query.all === '1' && req.user?.role === 'super_admin'
  const rows = all
    ? await db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all()
    : await db.prepare('SELECT * FROM notices WHERE active = 1 ORDER BY created_at DESC').all()
  res.json(rows.map((n) => ({
    id: Number(n.id), title: n.title, content: n.content, level: n.level,
    active: !!n.active, createdAt: n.created_at, updatedAt: n.updated_at
  })))
}))

/* ------------------------------------------------------------------ */
/* 我的设备                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/devices/mine', requireAuth, h(async (req, res) => {
  const rows = await db.prepare(
    `SELECT d.*, u.name AS user_name FROM devices d LEFT JOIN users u ON u.id = d.user_id
     WHERE d.user_id = ? ORDER BY d.last_seen DESC`
  ).all(req.user.id)
  res.json({
    current: req.currentDevice ? toDevice(await deviceWithUser(req.currentDevice.id)) : null,
    devices: rows.map(toDevice)
  })
}))

app.post('/api/devices/bind', requireAuth, h(async (req, res) => {
  const uuid = String(req.headers['x-device-id'] || '')
  if (!uuid) return res.status(400).json({ error: '无法识别当前设备' })
  const row = await db.prepare('SELECT * FROM devices WHERE uuid = ?').get(uuid)
  if (!row) return res.status(404).json({ error: '设备不存在' })
  if (row.status === 'revoked') return res.status(403).json({ error: '该设备已被管理员注销' })
  const bound = await bindDevice(uuid, req.user, true)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'device.bind', detail: `绑定设备 ${bound.name || bound.uuid}`, ip: clientIp(req) })
  broadcast('devices', { reason: 'bind' })
  res.json({ device: toDevice(await deviceWithUser(bound.id)) })
}))

app.patch('/api/devices/:id', requireAuth, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM devices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '设备不存在' })
  if (row.user_id !== req.user.id) return res.status(403).json({ error: '只能管理自己的设备' })
  const name = req.body?.name
  if (name !== undefined) {
    const n = String(name).trim()
    if (!n || n.length > 40) return res.status(400).json({ error: '设备名称需为 1-40 个字符' })
    await db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(n, id)
  }
  broadcast('devices', { reason: 'rename' })
  res.json({ device: toDevice(await deviceWithUser(id)) })
}))

app.delete('/api/devices/:id', requireAuth, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM devices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '设备不存在' })
  if (row.user_id !== req.user.id) return res.status(403).json({ error: '只能解绑自己的设备' })
  await db.prepare(
    "UPDATE devices SET user_id = NULL, identity = 'unassigned', status = 'pending', bound_at = NULL WHERE id = ?"
  ).run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'device.unbind', detail: `解绑设备 ${row.name || row.uuid}`, ip: clientIp(req) })
  broadcast('devices', { reason: 'unbind' })
  res.json({ ok: true })
}))

/* ------------------------------------------------------------------ */
/* 管理后台                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/admin/overview', isAdmin, h(async (req, res) => {
  const today = dateStr()
  const totalUsers = Number((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n)
  const students = Number((await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get()).n)
  const teachers = Number((await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role IN ('teacher','super_admin')").get()).n)
  const devices = Number((await db.prepare('SELECT COUNT(*) AS n FROM devices').get()).n)
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const online = Number((await db.prepare('SELECT COUNT(*) AS n FROM devices WHERE last_seen >= ?').get(cutoff)).n)
  const pendingDevices = Number((await db.prepare("SELECT COUNT(*) AS n FROM devices WHERE status = 'pending'").get()).n)

  const board = await getBoardPayload(today, null, 'guest')
  const roleRows = await db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all()
  const osRows = await db.prepare(
    "SELECT COALESCE(NULLIF(os,''),'未知系统') AS os, COUNT(*) AS n FROM devices GROUP BY os ORDER BY n DESC"
  ).all()

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    const b = await getBoardRow(d)
    let itemCount = 0
    let doneCount = 0
    if (b) {
      itemCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM items WHERE board_id = ?').get(b.id)).n)
      doneCount = Number(
        (await db.prepare(
          'SELECT COUNT(*) AS n FROM completions c JOIN items i ON i.id = c.item_id WHERE i.board_id = ?'
        ).get(b.id)).n
      )
    }
    days.push({ date: d, items: itemCount, done: doneCount })
  }

  const logs = (await db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 8').all()).map((l) => ({
    id: Number(l.id), username: l.username, action: l.action, detail: l.detail,
    ip: l.ip, createdAt: l.created_at
  }))

  res.json({
    stats: { totalUsers, students, teachers, devices, online, pendingDevices, todayItems: board.items.length, todayProgress: board.progress },
    roles: roleRows.map((r) => ({ role: r.role, count: Number(r.n) })),
    os: osRows.map((r) => ({ os: r.os, count: Number(r.n) })),
    days,
    logs,
    todayBoard: board
  })
}))

app.get('/api/admin/users', isAdmin, h(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`
  const rows = await db.prepare(
    `SELECT u.*, (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS device_count
     FROM users u
     WHERE u.username LIKE ? OR u.name LIKE ?
     ORDER BY CASE u.role WHEN 'super_admin' THEN 0 WHEN 'teacher' THEN 1 WHEN 'display' THEN 2 ELSE 3 END, u.id`
  ).all(q, q)
  res.json(rows.map((r) => ({ ...toUser(r), deviceCount: Number(r.device_count) })))
}))

app.post('/api/admin/users', isAdmin, h(async (req, res) => {
  const { username = '', password = '', name = '', role = 'student', className = '' } = req.body || {}
  const uname = String(username).trim()
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ error: '账号需为 3-20 位字母、数字或下划线' })
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' })
  if (!String(name).trim()) return res.status(400).json({ error: '请填写昵称' })
  if (!ROLES.includes(role)) return res.status(400).json({ error: '角色不合法' })
  if (await db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
    return res.status(409).json({ error: '该账号已存在' })
  }
  const settings = await getSettings()
  const colors = ['#4f46e5', '#0891b2', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']
  const info = await db.prepare(
    'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  ).run(uname, hashPassword(password), String(name).trim(), role, colors[Math.floor(Math.random() * colors.length)], className || settings.class_name, nowIso())
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.user_create', detail: `创建账号 ${uname}（${role}）`, ip: clientIp(req) })
  broadcast('users', { reason: 'create' })
  const user = toUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)))
  res.status(201).json(user)
}))

app.post('/api/admin/users/import', isAdmin, h(async (req, res) => {
  const inputNames = req.body?.names
  if (!Array.isArray(inputNames) || !inputNames.length) return res.status(400).json({ error: '表格中没有可导入的学生姓名' })
  if (inputNames.length > 200) return res.status(400).json({ error: '单次最多导入 200 名学生' })
  const password = String(req.body?.password || '123456')
  const prefix = String(req.body?.prefix || 'stu').trim()
  if (password.length < 6) return res.status(400).json({ error: '统一初始密码至少 6 位' })
  if (!/^[a-zA-Z0-9_]{1,12}$/.test(prefix)) return res.status(400).json({ error: '账号前缀仅支持 1-12 位字母、数字或下划线' })
  const names = [...new Set(inputNames.map((name) => String(name).trim()).filter(Boolean))]
  if (names.some((name) => name.length > 20)) return res.status(400).json({ error: '学生姓名不能超过 20 个字符' })
  if (!names.length) return res.status(400).json({ error: '表格中没有可导入的学生姓名' })

  const settings = await getSettings()
  const className = String(req.body?.className || settings.class_name).trim().slice(0, 30)
  const existing = await db.prepare('SELECT username, name, role, class_name FROM users').all()
  const usedUsernames = new Set(existing.map((row) => row.username))
  const existingStudents = new Set(
    existing.filter((row) => row.role === 'student').map((row) => `${row.name}\n${row.class_name || ''}`)
  )
  let sequence = 1
  const numberPattern = new RegExp(`^${prefix}(\\d+)$`)
  for (const row of existing) {
    const match = row.username.match(numberPattern)
    if (match) sequence = Math.max(sequence, Number(match[1]) + 1)
  }

  const colors = ['#4f46e5', '#0891b2', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']
  const accounts = []
  let skipped = 0
  for (const name of names) {
    if (existingStudents.has(`${name}\n${className}`)) {
      skipped++
      continue
    }
    let username
    do {
      username = `${prefix}${String(sequence++).padStart(3, '0')}`
    } while (usedUsernames.has(username))
    await db.prepare(
      'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hashPassword(password), name, 'student', colors[accounts.length % colors.length], className, nowIso())
    usedUsernames.add(username)
    existingStudents.add(`${name}\n${className}`)
    accounts.push({ username, name })
  }
  await addLog({
    userId: req.user.id,
    username: req.user.username,
    action: 'admin.user_import',
    detail: `从电子表格导入 ${accounts.length} 名学生，跳过 ${skipped} 名`,
    ip: clientIp(req)
  })
  broadcast('users', { reason: 'import' })
  res.status(201).json({ created: accounts.length, skipped, accounts })
}))

app.patch('/api/admin/users/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '用户不存在' })
  const { name, role, className, disabled, password } = req.body || {}
  if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: '角色不合法' })
  if (role !== undefined && row.role === 'super_admin' && role !== 'super_admin') {
    const admins = Number((await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").get()).n)
    if (admins <= 1) return res.status(400).json({ error: '至少保留一个超级管理员' })
  }
  if (disabled && id === req.user.id) return res.status(400).json({ error: '不能停用当前登录账号' })
  await db.prepare(
    'UPDATE users SET name = ?, role = ?, class_name = ?, disabled = ?, password_hash = ? WHERE id = ?'
  ).run(
    name !== undefined ? String(name).trim().slice(0, 20) : row.name,
    role !== undefined ? role : row.role,
    className !== undefined ? String(className).slice(0, 30) : row.class_name,
    disabled !== undefined ? (disabled ? 1 : 0) : row.disabled,
    password ? hashPassword(password) : row.password_hash,
    id
  )
  if (disabled) await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  if (role === 'display') await db.prepare("UPDATE devices SET identity = 'display' WHERE user_id = ?").run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.user_update', detail: `更新账号 ${row.username}`, ip: clientIp(req) })
  broadcast('users', { reason: 'update' })
  res.json(toUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(id)))
}))

app.delete('/api/admin/users/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) return res.status(400).json({ error: '不能删除当前登录账号' })
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '用户不存在' })
  if (row.role === 'super_admin') {
    const admins = Number((await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").get()).n)
    if (admins <= 1) return res.status(400).json({ error: '至少保留一个超级管理员' })
  }
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  await db.prepare('DELETE FROM completions WHERE user_id = ?').run(id)
  await db.prepare("UPDATE devices SET user_id = NULL, identity = 'unassigned', status = 'pending' WHERE user_id = ?").run(id)
  await db.prepare('DELETE FROM users WHERE id = ?').run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.user_delete', detail: `删除账号 ${row.username}`, ip: clientIp(req) })
  broadcast('users', { reason: 'delete' })
  res.json({ ok: true })
}))

app.get('/api/admin/devices', isAdmin, h(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`
  const rows = await db.prepare(
    `SELECT d.*, u.name AS user_name, u.username AS username
     FROM devices d LEFT JOIN users u ON u.id = d.user_id
     WHERE d.name LIKE ? OR d.uuid LIKE ? OR d.ip LIKE ? OR u.name LIKE ? OR u.username LIKE ?
     ORDER BY d.last_seen DESC`
  ).all(q, q, q, q, q)
  res.json(rows.map((r) => ({ ...toDevice(r), username: r.username || null })))
}))

app.patch('/api/admin/devices/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM devices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '设备不存在' })
  const { name, identity, status, userId } = req.body || {}
  if (identity !== undefined && !IDENTITIES.includes(identity)) return res.status(400).json({ error: '设备身份不合法' })
  if (status !== undefined && !DEVICE_STATUS.includes(status)) return res.status(400).json({ error: '设备状态不合法' })
  let nextUserId = row.user_id
  let nextStatus = status !== undefined ? status : row.status
  if (userId !== undefined) {
    nextUserId = userId === null ? null : Number(userId)
    if (nextUserId !== null) {
      const target = await db.prepare('SELECT id FROM users WHERE id = ?').get(nextUserId)
      if (!target) return res.status(400).json({ error: '绑定的用户不存在' })
      nextStatus = status !== undefined ? status : 'bound'
    } else {
      nextStatus = status !== undefined ? status : 'pending'
    }
  }
  await db.prepare(
    'UPDATE devices SET name = ?, identity = ?, status = ?, user_id = ?, bound_at = CASE WHEN ?::int IS NULL THEN NULL ELSE COALESCE(bound_at, ?) END WHERE id = ?'
  ).run(
    name !== undefined ? String(name).trim().slice(0, 40) : row.name,
    identity !== undefined ? identity : row.identity,
    nextStatus,
    nextUserId,
    nextUserId,
    nowIso(),
    id
  )
  if (nextStatus === 'revoked') await db.prepare('DELETE FROM sessions WHERE device_uuid = ?').run(row.uuid)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.device_update', detail: `调整设备 ${row.name || row.uuid}：${identity || row.identity} / ${nextStatus}`, ip: clientIp(req) })
  broadcast('devices', { reason: 'admin-update' })
  res.json(toDevice(await deviceWithUser(id)))
}))

app.delete('/api/admin/devices/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM devices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '设备不存在' })
  await db.prepare('DELETE FROM sessions WHERE device_uuid = ?').run(row.uuid)
  await db.prepare('DELETE FROM devices WHERE id = ?').run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.device_delete', detail: `删除设备 ${row.name || row.uuid}`, ip: clientIp(req) })
  broadcast('devices', { reason: 'delete' })
  res.json({ ok: true })
}))

app.get('/api/admin/logs', isAdmin, h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const rows = await db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit)
  res.json(rows.map((l) => ({
    id: Number(l.id), userId: l.user_id, username: l.username, action: l.action,
    detail: l.detail, ip: l.ip, createdAt: l.created_at
  })))
}))

app.get('/api/admin/settings', isAdmin, h(async (req, res) => res.json(await getSettings())))

app.patch('/api/admin/settings', isAdmin, h(async (req, res) => {
  const body = req.body || {}
  const allowed = Object.keys(DEFAULT_SETTINGS)
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue
    await setSetting(key, value)
  }
  await addLog({ userId: req.user.id, username: req.user.username, action: 'admin.settings', detail: '更新系统设置', ip: clientIp(req) })
  broadcast('settings', {})
  res.json(await getSettings())
}))

app.post('/api/admin/notices', isAdmin, h(async (req, res) => {
  const { title = '', content = '', level = 'info', active = true } = req.body || {}
  if (!String(title).trim()) return res.status(400).json({ error: '请填写公告标题' })
  if (!['info', 'warning', 'urgent'].includes(level)) return res.status(400).json({ error: '公告级别不合法' })
  const now = nowIso()
  const info = await db.prepare(
    'INSERT INTO notices (title, content, level, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).run(String(title).trim().slice(0, 60), String(content).slice(0, 500), level, active ? 1 : 0, now, now)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'notice.create', detail: `发布公告「${title}」`, ip: clientIp(req) })
  broadcast('notices', {})
  res.status(201).json({ id: Number(info.lastInsertRowid) })
}))

app.patch('/api/admin/notices/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM notices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '公告不存在' })
  const { title, content, level, active } = req.body || {}
  await db.prepare(
    'UPDATE notices SET title = ?, content = ?, level = ?, active = ?, updated_at = ? WHERE id = ?'
  ).run(
    title !== undefined ? String(title).trim().slice(0, 60) : row.title,
    content !== undefined ? String(content).slice(0, 500) : row.content,
    level !== undefined ? level : row.level,
    active !== undefined ? (active ? 1 : 0) : row.active,
    nowIso(),
    id
  )
  await addLog({ userId: req.user.id, username: req.user.username, action: 'notice.update', detail: `更新公告「${row.title}」`, ip: clientIp(req) })
  broadcast('notices', {})
  res.json({ ok: true })
}))

app.delete('/api/admin/notices/:id', isAdmin, h(async (req, res) => {
  const id = Number(req.params.id)
  const row = await db.prepare('SELECT * FROM notices WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: '公告不存在' })
  await db.prepare('DELETE FROM notices WHERE id = ?').run(id)
  await addLog({ userId: req.user.id, username: req.user.username, action: 'notice.delete', detail: `删除公告「${row.title}」`, ip: clientIp(req) })
  broadcast('notices', {})
  res.json({ ok: true })
}))

/* ------------------------------------------------------------------ */
/* 每日自动更新                                                         */
/* ------------------------------------------------------------------ */

export async function dailyTick() {
  const today = dateStr()
  const board = await getBoardRow(today)
  if (board) return { created: false, date: today, copied: 0 }
  const settings = await getSettings()
  await ensureBoard(today)
  let copied = 0
  if (settings.auto_carry === '1') copied = await copyItems(addDays(today, -1), today)
  await addLog({ action: 'board.daily', detail: `每日自动更新：创建 ${today} 作业板${copied ? `，继承 ${copied} 条作业` : ''}` })
  broadcast('board', { date: today, auto: true })
  return { created: true, date: today, copied }
}

export async function cleanupSessions() {
  const cutoff = new Date(Date.now() - SESSION_DAYS * 86400 * 1000).toISOString()
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(cutoff)
}

/** Vercel Cron：每天 00:05（Asia/Shanghai）触发 */
app.get('/api/cron/daily', h(async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = String(req.headers.authorization || '')
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-cron-secret'] || '')
    if (given !== secret) return res.status(401).json({ error: 'unauthorized' })
  }
  const result = await dailyTick()
  await cleanupSessions()
  res.json({ ok: true, ...result })
}))

/* ------------------------------------------------------------------ */
/* 静态资源与错误处理                                                    */
/* ------------------------------------------------------------------ */

app.use(express.static(DIST_DIR))

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexFile = path.join(DIST_DIR, 'index.html')
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile)
    return res
      .status(503)
      .type('html')
      .send('<h1>前端尚未构建</h1><p>请先执行 <code>npm run build</code>，或使用 <code>npm run dev</code> 启动开发服务器。</p>')
  }
  next()
})

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }))

app.use((err, req, res, next) => {
  console.error('[server]', err)
  if (res.headersSent) return next(err)
  const status = Number(err.status) || 500
  const message = status === 413 ? '上传内容过大，请将单次附件控制在 3 MB 以内' : status < 500 ? err.message : '服务器开小差了，请稍后再试'
  res.status(status).json({ error: message })
})

export default app
