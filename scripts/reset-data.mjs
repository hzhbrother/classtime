/**
 * 清空业务数据，只保留超级管理员与系统设置。
 * 用法：DATABASE_URL='postgres://...' node scripts/reset-data.mjs
 */
import { db, initDb, hashPassword, nowIso, DEFAULT_SETTINGS } from '../server/db.js'

try {
  await initDb()

  for (const table of ['sessions', 'completions', 'items', 'boards', 'notices', 'devices', 'logs']) {
    const r = await db.exec(`DELETE FROM ${table}`)
    console.log(`${table}: 删除 ${r.rowCount} 行`)
  }

  const removed = await db.exec("DELETE FROM users WHERE role <> 'super_admin'")
  console.log(`users: 删除 ${removed.rowCount} 个非超级管理员账号`)

  let admins = await db.prepare("SELECT username FROM users WHERE role = 'super_admin'").all()
  if (admins.length === 0) {
    await db
      .prepare(
        'INSERT INTO users (username, password_hash, name, role, color, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run('admin', hashPassword(process.env.ADMIN_INITIAL_PASSWORD || 'admin123'), '超级管理员', 'super_admin', '#4f46e5', DEFAULT_SETTINGS.class_name, nowIso())
    admins = [{ username: 'admin' }]
    console.log('已创建超级管理员 admin（初始密码 admin123，请登录后立即修改）')
  }

  console.log('保留的超级管理员：', admins.map((a) => a.username).join(', '))
  console.log('完成。系统设置已保留，作业、公告、设备、日志、其他账号均已清空。')
  process.exit(0)
} catch (err) {
  console.error('清空失败：', err.message)
  process.exit(1)
}
