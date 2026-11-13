import app from '../server/app.js'
import { initDb } from '../server/db.js'

let ready = null

export default async function handler(req, res) {
  try {
    if (!ready) {
      ready = initDb().catch((err) => {
        ready = null
        throw err
      })
    }
    await ready
    return app(req, res)
  } catch (err) {
    console.error('[api] init failed', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: '服务器初始化失败，请检查 DATABASE_URL 配置' }))
  }
}
