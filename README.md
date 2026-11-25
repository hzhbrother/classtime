# 班级作业云

面向班级的云端作业板：老师在电脑或手机上发布作业，教室大屏实时展示，家长和学生打开网页即可查看。每日零点自动建板并继承前一天的作业，多端数据始终同步。

在线体验：[classtime.us.ci](https://classtime.us.ci)

<img src="docs/screenshots/display-board.jpg" width="820" alt="班级大屏作业板" />

## 主要功能

### 班级大屏
- 深色大屏版式，按科目卡片展示当天作业，加急作业高亮标记
- 顶部实时时钟、作业总数与加急数量统计
- 日期导航可回看历史作业，支持字号放大缩小
- 已发布状态实时同步，老师发布后大屏自动刷新

### 作业发布与管理
- 按科目登记作业内容，支持课时截止时间、加急、备注
- 附件上传：大文件自动分片并发上传，下载按分片 Range 拉取，支持下载进度浮层
- 一键复制前一日作业，减少重复录入
- 发布 / 转草稿切换，草稿仅后台可见
- 历史作业按科目排序规则展示

### 一键导出作业海报
- 将当前日期已发布作业自动排版成一张高清竖版 PNG 海报
- 深色渐变页眉、科目彩色卡片、加急与课时标识、备注与附件名
- 先弹窗预览，确认后一键下载，适合发班级群或打印张贴

<img src="docs/screenshots/poster.png" width="300" alt="导出的作业海报" />

### 科目管理与排序
- 后台自由添加、删除科目，上移 / 下移调整顺序
- 排序结果直接作用于大屏与作业列表，保存后自动同步
- 新建作业时的科目下拉同步更新

### 多端与账号
- 电脑、手机、班级大屏三种终端，数据云端同步
- 学生自助注册，管理员审核
- 设备识别与绑定，教师可管理自己的设备
- 超级管理员后台统一管理用户、设备、公告与日志

<img src="docs/screenshots/login-page.jpg" width="720" alt="登录页" />

### 自动化
- 每日定时任务自动创建当天作业板，并按设置继承前一天内容
- 作业板与设置变更实时推送到大屏，弱网环境自动降级为轮询同步

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

## 清空已有数据

如果数据库里已经有演示或测试数据，可一键清空（保留超级管理员与系统设置）：

```bash
DATABASE_URL='postgres://...' node scripts/reset-data.mjs
```

## 创建者

由 [hzhbrother](https://github.com/hzhbrother) 创建并维护。

欢迎提交 Issue 反馈问题或建议新功能。
