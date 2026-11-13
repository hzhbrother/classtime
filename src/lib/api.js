import { deviceHeaders } from './device'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const TIMEOUT = 20000

function isWechat() {
  return /MicroMessenger/i.test(navigator.userAgent || '')
}

function networkError() {
  return new ApiError(
    isWechat()
      ? '网络连接失败，请稍后重试；若一直失败，请点右上角 ··· 选择“在浏览器打开”'
      : '网络连接失败，请检查网络后重试',
    0
  )
}

function xhrSend(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.withCredentials = true
    xhr.timeout = TIMEOUT
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: xhr.responseText
      })
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('timeout'))
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.send(body ?? null)
  })
}

async function fetchSend(url, method, headers, body) {
  if (typeof AbortController !== 'function') throw new Error('unsupported')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body,
      signal: controller.signal
    })
    return { ok: response.ok, status: response.status, text: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let headers = {}
  try {
    headers = { ...deviceHeaders() }
  } catch {
    /* 设备信息不可用时不影响请求本身 */
  }

  const payload = body !== undefined ? JSON.stringify(body) : undefined
  if (payload !== undefined) headers['Content-Type'] = 'application/json'

  const url = `/api${path}`
  let result
  try {
    result = await fetchSend(url, method, headers, payload)
  } catch {
    // 微信内置浏览器 / 老旧 X5 内核会偶发 fetch 失败，改用 XHR 再请求一次
    try {
      result = await xhrSend(url, method, headers, payload)
    } catch {
      throw networkError()
    }
  }

  let data = null
  try {
    data = result.text ? JSON.parse(result.text) : null
  } catch {
    data = null
  }

  if (!result.ok) {
    if (result.status === 401) window.dispatchEvent(new CustomEvent('cb:unauthorized'))
    throw new ApiError(data?.error || `请求失败（${result.status}）`, result.status)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' })
}
