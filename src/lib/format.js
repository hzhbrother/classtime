export const SUBJECT_COLORS = {
  语文: '#ef4444',
  数学: '#3b82f6',
  英语: '#8b5cf6',
  物理: '#f59e0b',
  化学: '#10b981',
  生物: '#14b8a6',
  历史: '#f97316',
  地理: '#0ea5e9',
  政治: '#ec4899',
  体育: '#22c55e',
  音乐: '#a855f7',
  美术: '#f43f5e',
  信息技术: '#0ea5e9',
  心理: '#eab308',
  其他: '#64748b'
}

const FALLBACK_COLORS = ['#4f46e5', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899']

export function subjectColor(name = '') {
  if (SUBJECT_COLORS[name]) return SUBJECT_COLORS[name]
  let hash = 0
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

export function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftDate(dateText, n) {
  const [y, m, d] = dateText.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function parseDate(dateText) {
  const [y, m, d] = String(dateText).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function weekdayCN(dateText) {
  const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return names[parseDate(dateText).getDay()]
}

export function formatDateCN(dateText) {
  const dt = parseDate(dateText)
  return `${dt.getMonth() + 1}月${dt.getDate()}日`
}

export function formatClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatClockSec(date = new Date()) {
  return `${formatClock(date)}:${String(date.getSeconds()).padStart(2, '0')}`
}

export function relativeTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '刚刚'
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const dt = new Date(iso)
  return `${dt.getMonth() + 1}月${dt.getDate()}日`
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

export const ROLE_LABELS = {
  super_admin: '超级管理员',
  teacher: '教师',
  student: '学生',
  display: '班级大屏'
}

export const IDENTITY_LABELS = {
  unassigned: '未分配',
  teacher: '教师端',
  student: '学生端',
  display: '班级大屏',
  guest: '访客'
}

export const DEVICE_STATUS_LABELS = {
  pending: '待绑定',
  bound: '已绑定',
  revoked: '已停用'
}

export const ACTION_LABELS = {
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'auth.register': '注册账号',
  'auth.profile': '更新资料',
  'board.auto_create': '自动建板',
  'board.daily': '每日更新',
  'board.update': '更新作业板',
  'board.carry': '复制作业',
  'item.create': '新增作业',
  'item.update': '修改作业',
  'item.delete': '删除作业',
  'device.bind': '绑定设备',
  'device.unbind': '解绑设备',
  'admin.user_create': '创建账号',
  'admin.user_update': '更新账号',
  'admin.user_delete': '删除账号',
  'admin.device_update': '调整设备',
  'admin.device_delete': '删除设备',
  'admin.settings': '系统设置',
  'notice.create': '发布公告',
  'notice.update': '更新公告',
  'notice.delete': '删除公告'
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || action
}

export function initials(name = '') {
  const trimmed = String(name).replace(/·.*$/, '').trim()
  return trimmed.slice(0, 1) || '?'
}

export function subjectInitial(subject = '') {
  return String(subject).slice(0, 1) || '作'
}
