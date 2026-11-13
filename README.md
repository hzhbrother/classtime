# 班级作业云

多端班级作业板：PC / 手机 / 班级大屏，支持设备识别与绑定、超级管理员后台、每日自动更新、云端同步。

## 技术栈

- 前端：Vue 3 + Vite + Vue Router
- 后端：Express 5
- 数据库：PostgreSQL（Neon / Supabase 均可）
- 部署：Vercel Serverless Functions + Vercel Cron

## 本地运行

```bash
# 1. 准备一个 PostgreSQL 数据库，并设置连接串
export DATABASE_URL='postgres://user:password@127.0.0.1:5432/classwork'

# 2. 安装依赖
npm install

# 3. 启动后端（:3000，首次启动自动建表，仅创建超级管理员）
npm run dev:server

# 4. 另开终端启动前端（:5173，/api 自动代理到 :3000）
npm run dev
```

生产预览：`npm run build && npm start`

## 初始账号

全新数据库只创建一个账号，其余老师、学生、大屏账号均由管理员在后台创建：

| 身份 | 账号 | 密码 |
| --- | --- | --- |
| 超级管理员 | admin | admin123（可用环境变量 `ADMIN_INITIAL_PASSWORD` 自定义，首次登录后请立即修改） |

系统不会生成任何演示作业、公告、设备或日志。

## 清空已有数据

如果数据库里已经有演示或测试数据，可一键清空（保留超级管理员与系统设置）：

```bash
DATABASE_URL='postgres://...' node scripts/reset-data.mjs
```

## 管理后台入口

- 电脑 / 手机：访问 `/login?admin=1`，或在登录页底部点击「管理员入口」。
- 班级大屏：右上角盾牌图标可直接进入管理员登录页。
- 仅 `super_admin` 账号可进入 `/admin`；其他账号会被拒绝并提示无管理权限。

## 部署到 Vercel + Neon

1. 在 [Neon](https://neon.tech) 创建项目，复制 **Pooled connection** 连接串（主机名含 `-pooler`）。
2. 在 Vercel 导入本仓库，Framework Preset 选择 **Vite**（构建命令与输出目录已由 `vercel.json` 指定）。
3. 在 Vercel 项目环境变量中添加：
   - `DATABASE_URL`：Neon 连接串（必填）
   - `CRON_SECRET`：任意随机字符串（可选，用于保护定时任务接口）
4. 部署完成后访问站点，首次请求自动建表并创建超级管理员，不包含任何演示数据。

`vercel.json` 已配置每日定时任务：每天 00:05（Asia/Shanghai，即 16:05 UTC）调用 `/api/cron/daily`，自动创建当天作业板并按设置继承前一天的作业。

> 说明：Vercel Serverless 无法保持 SSE 长连接，线上会自动切换为轮询同步（默认 30 秒）；本地常驻运行时仍使用 SSE 实时推送。
