import app, { dailyTick, cleanupSessions } from './app.js'
import { initDb } from './db.js'

const PORT = Number(process.env.PORT || 3000)

await initDb()

app.listen(PORT, () => {
  console.log(`\n  班级作业云已启动 → http://localhost:${PORT}`)
  console.log('  数据存储：PostgreSQL（DATABASE_URL）')
  console.log('  超级管理员：admin / admin123')
  console.log(`  今日日期（Asia/Shanghai）：${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())}\n`)
})

/* 常驻部署下保留每日自动更新与会话清理；Vercel 由 Cron 触发 */
if (!process.env.VERCEL) {
  let ticking = false
  setInterval(async () => {
    if (ticking) return
    ticking = true
    try {
      await dailyTick()
    } catch (err) {
      console.error('[dailyTick]', err)
    } finally {
      ticking = false
    }
  }, 30000).unref?.()

  setInterval(() => {
    cleanupSessions().catch((err) => console.error('[cleanupSessions]', err))
  }, 3600 * 1000).unref?.()
}
