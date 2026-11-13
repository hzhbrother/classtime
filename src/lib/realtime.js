import { reactive } from 'vue'

export const realtime = reactive({
  connected: false,
  lastEventAt: null,
  lastType: ''
})

let source = null
const subscribers = new Set()

function connect() {
  if (source) return
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
    for (const fn of subscribers) {
      try {
        fn(payload)
      } catch {
        /* ignore subscriber errors */
      }
    }
  }
}

export function subscribeRealtime(fn) {
  subscribers.add(fn)
  connect()
  return () => subscribers.delete(fn)
}
