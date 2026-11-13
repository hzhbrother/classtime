const STORAGE_KEY = 'cb_device_id'

export function getDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

export function detectDevice() {
  const ua = navigator.userAgent || ''
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  let os = '未知系统'
  if (/Windows/.test(ua) || /Win/.test(platform)) os = 'Windows'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/HarmonyOS|OpenHarmony/.test(ua)) os = 'HarmonyOS'
  else if (/Mac OS X|Macintosh/.test(ua) || /Mac/.test(platform)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = '未知浏览器'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/MicroMessenger/.test(ua)) browser = '微信'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let deviceType = 'desktop'
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) deviceType = 'tablet'
  else if (/Mobi|iPhone|iPod|Android.*Mobile/.test(ua)) deviceType = 'mobile'

  return {
    os,
    browser,
    platform,
    screen: `${window.screen.width}x${window.screen.height}`,
    deviceType
  }
}

export function deviceHeaders() {
  const info = detectDevice()
  return {
    'x-device-id': getDeviceId(),
    'x-device-os': info.os,
    'x-device-browser': info.browser,
    'x-device-platform': info.platform,
    'x-device-screen': info.screen,
    'x-device-type': info.deviceType
  }
}
