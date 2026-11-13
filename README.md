# 班级作业云

多端班级作业板：PC / 手机 / 班级大屏，支持设备识别与绑定、超级管理员后台、每日自动更新、云端同步。

## 技术栈

- 前端：Vue 3 + Vite + Vue Router
- 后端：Express 5
- 数据库：PostgreSQL（Neon）
- 部署：Vercel Serverless Functions + Vercel Cron

## 本地运行

```bash
# 1. 准备一个 PostgreSQL 数据库，并设置连接串
export DATABASE_URL='postgres://user:password@127.0.0.1:5432/classwork'

# 2. 安装依赖
npm install

# 3. 启动后端（:3000，首次启动会自动建表并写入演示数据）
npm run dev:server

# 4. 另开终端启动前端（:5173，/api 自动代理到 :3000）
npm run dev
```

生产预览：`npm run build && npm start`

## 演示账号

| 身份 | 账号 | 密码 |
| --- | --- | --- |
| 超级管理员 | admin | admin123 |
| 班主任 | teacher | teacher123 |
| 学生 | student | student123 |
| 班级大屏 | display | display123 |

## 部署到 Vercel + Neon

1. 在 [Neon](https://neon.tech) 创建项目，复制 **Pooled connection** 连接串（主机名含 `-pooler`）。
2. 在 Vercel 导入本仓库，Framework Preset 选择 **Vite**（构建命令与输出目录已由 `vercel.json` 指定）。
3. 在 Vercel 项目环境变量中添加：
   - `DATABASE_URL`：Neon 连接串（必填）
   - `CRON_SECRET`：任意随机字符串（可选，用于保护定时任务接口）
4. 部署完成后访问站点，首次请求会自动建表并写入演示数据。

`vercel.json` 已配置每日定时任务：每天 00:05（Asia/Shanghai，即 16:05 UTC）调用 `/api/cron/daily`，自动创建当天作业板并按设置继承前一天的作业。

> 说明：Vercel Serverless 无法保持 SSE 长连接，线上会自动切换为轮询同步（默认 30 秒）；本地常驻运行时仍使用 SSE 实时推送。
