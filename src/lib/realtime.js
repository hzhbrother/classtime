import { reactive } from 'vue'

export const realtime = reactive({
  connected: false,
  lastEventAt: null,
  lastType: '',
  mode: 'unknown'
})

let source = null
let starting = null
const subscribers = new Set()

async function detectMode() {
  try {
    const res = await fetch('/api/capabilities', { credentials: 'same-origin' })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.realtime
  } catch {
    return false
  }
}

function emit(message) {
  for (const fn of subscribers) {
    try {
      fn(message)
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function startPollingFallback() {
  realtime.mode = 'poll'
  realtime.connected = true
  // Serverless 环境无法保持 SSE 长连接，各页面已按 autoSyncSeconds 轮询数据。
}

function connectSSE() {
  realtime.mode = 'sse'
  source = new EventSource('/api/events')
  source.onopen = () => {
    realtime.connected = true
  }
  source.onerror = () => {
    realtime.connected = false
  }
  source.onmessage = (event) => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }
    realtime.connected = true
    realtime.lastType = payload.type
    realtime.lastEventAt = Date.now()
    emit(payload)
  }
}

async function connect() {
  if (starting || source || realtime.mode === 'poll') return starting
  starting = (async () => {
    const supportsRealtime = await detectMode()
    if (supportsRealtime) connectSSE()
    else startPollingFallback()
    starting = null
  })()
  return starting
}

export function subscribeRealtime(fn) {
  subscribers.add(fn)
  connect()
  return () => subscribers.delete(fn)
}
