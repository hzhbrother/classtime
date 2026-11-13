import { reactive } from 'vue'
import { api } from './api'

const defaultSettings = {
  siteName: '班级作业云',
  className: '高二(3)班',
  allowRegister: true,
  allowPublicDisplay: true,
  autoSyncSeconds: 30,
  displayMotto: '把今天的作业，变成明天的底气。',
  rolloverTime: '00:05'
}

export const state = reactive({
  user: null,
  device: null,
  settings: { ...defaultSettings },
  ready: false,
  toasts: [],
  confirm: { open: false, title: '', message: '', danger: false, resolve: null }
})

let inflight = null

export async function ensureSession() {
  if (state.ready) return state
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const data = await api.get('/auth/me')
      state.user = data.user
      state.device = data.device
      state.settings = { ...defaultSettings, ...(data.settings || {}) }
    } catch {
      state.user = null
    } finally {
      state.ready = true
      inflight = null
    }
  })()
  return inflight
}

export async function refreshMe() {
  const data = await api.get('/auth/me')
  state.user = data.user
  state.device = data.device
  state.settings = { ...defaultSettings, ...(data.settings || {}) }
  state.ready = true
  return data
}

export async function login(username, password) {
  const data = await api.post('/auth/login', { username, password })
  state.user = data.user
  state.device = data.device
  state.settings = { ...defaultSettings, ...(data.settings || {}) }
  state.ready = true
  return data
}

export async function register(payload) {
  const data = await api.post('/auth/register', payload)
  state.user = data.user
  state.device = data.device
  state.settings = { ...defaultSettings, ...(data.settings || {}) }
  state.ready = true
  return data
}

export async function logout() {
  try {
    await api.post('/auth/logout')
  } catch {
    /* ignore */
  }
  state.user = null
  state.device = null
}

export function applyPublicSettings(settings) {
  state.settings = { ...state.settings, ...(settings || {}) }
}

export function pushToast(message, type = 'success', title = '') {
  const id = Date.now() + Math.random()
  state.toasts.push({ id, message, type, title })
  setTimeout(() => {
    const idx = state.toasts.findIndex((t) => t.id === id)
    if (idx >= 0) state.toasts.splice(idx, 1)
  }, 3000)
}

export function confirmDialog(message, { title = '请确认操作', danger = false } = {}) {
  return new Promise((resolve) => {
    state.confirm = { open: true, title, message, danger, resolve }
  })
}

export function resolveConfirm(value) {
  const resolve = state.confirm.resolve
  state.confirm.open = false
  state.confirm.resolve = null
  if (resolve) resolve(value)
}

window.addEventListener('cb:unauthorized', () => {
  if (state.user) {
    state.user = null
    state.device = null
  }
})
