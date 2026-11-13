<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '../components/Icon.vue'
import { api } from '../lib/api'
import { state, ensureSession } from '../lib/store'
import { subscribeRealtime, realtime } from '../lib/realtime'
import { subjectColor, subjectInitial, todayStr, shiftDate, weekdayCN, formatDateCN } from '../lib/format'

const date = ref(todayStr())
const board = ref(null)
const notices = ref([])
const error = ref('')
const now = ref(new Date())
const noticeIndex = ref(0)
const refreshing = ref(false)
const settings = ref({ ...state.settings })

const items = computed(() => board.value?.items || [])
const urgent = computed(() => items.value.filter((i) => i.priority === 'urgent'))
const progress = computed(() => board.value?.progress || 0)
const yesterdayItems = computed(() => board.value?.previousDay?.items || [])
const isToday = computed(() => date.value === todayStr())
const dateLabel = computed(() => `${formatDateCN(date.value)} · ${weekdayCN(date.value)}${isToday.value ? ' · 今天' : ''}`)
const clockParts = computed(() => {
  const d = now.value
  return {
    h: String(d.getHours()).padStart(2, '0'),
    m: String(d.getMinutes()).padStart(2, '0'),
    s: String(d.getSeconds()).padStart(2, '0')
  }
})
const currentNotice = computed(() => {
  if (!notices.value.length) return null
  return notices.value[noticeIndex.value % notices.value.length]
})
const gridStyle = computed(() => {
  const count = items.value.length
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4
  return { '--d-columns': columns }
})

let clockTimer = null
let pollTimer = null
let noticeTimer = null
let unsubscribe = null
let currentDate = todayStr()

async function loadBoard(silent = true) {
  try {
    board.value = await api.get(`/board?date=${date.value}`)
    error.value = ''
  } catch (err) {
    error.value = err.message
    if (!silent) board.value = null
  }
}

async function loadNotices() {
  try {
    notices.value = await api.get('/notices')
  } catch {
    /* ignore */
  }
}

async function loadSettings() {
  try {
    settings.value = await api.get('/settings/public')
  } catch {
    /* ignore */
  }
}

async function refreshAll() {
  if (refreshing.value) return
  refreshing.value = true
  await Promise.all([loadBoard(false), loadNotices(), loadSettings()])
  refreshing.value = false
}

function changeDate(offset) {
  date.value = shiftDate(date.value, offset)
  loadBoard(false)
}

function onDateInput(event) {
  if (!event.target.value) return
  date.value = event.target.value
  loadBoard(false)
}

function pendingNames(item) {
  const names = item.pendingStudents?.map((student) => student.name) || []
  if (!names.length) return item.doneCount > 0 ? '全部交齐' : '暂无登记'
  const visible = names.slice(0, 12).join('、')
  return names.length > 12 ? `${visible} 等 ${names.length} 人` : visible
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await ensureSession()
  await Promise.all([loadBoard(false), loadNotices(), loadSettings()])
  unsubscribe = subscribeRealtime((msg) => {
    if (msg.type === 'board' && (!msg.data?.date || msg.data.date === date.value)) loadBoard()
    if (msg.type === 'notices') loadNotices()
    if (msg.type === 'settings') loadSettings()
  })
  clockTimer = setInterval(() => {
    now.value = new Date()
    const today = todayStr()
    if (today !== currentDate) {
      if (date.value === currentDate) {
        date.value = today
        loadBoard()
      }
      currentDate = today
      loadNotices()
    }
  }, 1000)
  pollTimer = setInterval(() => loadBoard(), 30000)
  noticeTimer = setInterval(() => {
    if (notices.value.length > 1) noticeIndex.value = (noticeIndex.value + 1) % notices.value.length
  }, 8000)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(pollTimer)
  clearInterval(noticeTimer)
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <div class="display-page">
    <div class="orb orb-1" />
    <div class="orb orb-2" />
    <div class="orb orb-3" />

    <header class="d-header">
      <div class="d-brand">
        <span class="d-brand-mark"><Icon name="book" :size="20" /></span>
        <div>
          <div class="d-brand-name">{{ settings.siteName }}</div>
          <div class="d-brand-sub">{{ settings.className }} · 班级作业大屏</div>
        </div>
      </div>
      <div class="d-header-right">
        <div class="d-sync" :class="{ off: !realtime.connected }">
          <span class="dot" />{{ realtime.connected ? '实时同步中' : '连接中断' }}
        </div>
        <button class="d-icon-btn" title="全屏" @click="toggleFullscreen">
          <Icon name="fullscreen" :size="18" />
        </button>
      </div>
    </header>

    <div v-if="!settings.allowPublicDisplay && !state.user" class="d-gate">
      <Icon name="lock" :size="28" />
      <p>大屏展示未对外开放，请登录后访问。</p>
      <a class="d-gate-btn" href="/login">去登录</a>
    </div>

    <template v-else>
      <section class="d-hero">
        <div>
          <div class="d-date">{{ dateLabel }}</div>
          <div class="d-clock">
            {{ clockParts.h }}<span class="colon">:</span>{{ clockParts.m }}<span class="d-sec">{{ clockParts.s }}</span>
          </div>
        </div>
        <div class="d-hero-side">
          <div class="d-stat"><b>{{ items.length }}</b><span>项作业</span></div>
          <div class="d-stat"><b>{{ urgent.length }}</b><span>项加急</span></div>
          <div class="d-stat accent"><b>{{ progress }}%</b><span>班级提交</span></div>
        </div>
      </section>

      <section class="d-subbar">
        <div class="d-date-controls">
          <button class="d-icon-btn" title="前一天" @click="changeDate(-1)"><Icon name="chevronLeft" :size="18" /></button>
          <label class="d-date-picker" title="选择日期">
            <Icon name="calendar" :size="16" />
            <input type="date" :value="date" @change="onDateInput" />
          </label>
          <button class="d-icon-btn" title="后一天" @click="changeDate(1)"><Icon name="chevronRight" :size="18" /></button>
          <button class="d-icon-btn" title="刷新" :disabled="refreshing" @click="refreshAll">
            <Icon name="refresh" :size="17" :class="{ spin: refreshing }" />
          </button>
        </div>
        <div class="d-yesterday">
          <span class="d-yesterday-title">昨日作业提交</span>
          <template v-if="yesterdayItems.length">
            <span v-for="item in yesterdayItems" :key="item.id" class="d-yesterday-item">
              {{ item.subject }} <b>{{ item.doneCount }}/{{ item.studentCount }}</b> 人
            </span>
          </template>
          <span v-else class="d-yesterday-empty">昨日暂无作业</span>
        </div>
      </section>

      <Transition name="notice" mode="out-in">
        <div v-if="currentNotice" :key="currentNotice.id" class="d-notice" :class="currentNotice.level">
          <Icon name="bell" :size="18" />
          <span class="d-notice-tag">{{ currentNotice.level === 'urgent' ? '紧急' : currentNotice.level === 'warning' ? '提醒' : '通知' }}</span>
          <span class="d-notice-title">{{ currentNotice.title }}</span>
          <span class="d-notice-content">{{ currentNotice.content }}</span>
          <span v-if="notices.length > 1" class="d-notice-count">{{ noticeIndex + 1 }} / {{ notices.length }}</span>
        </div>
      </Transition>

      <div v-if="error" class="d-error"><Icon name="alert" :size="15" />{{ error }}</div>

      <main v-if="items.length" class="d-grid" :style="gridStyle">
        <article
          v-for="item in items"
          :key="item.id"
          class="d-card"
          :class="{ urgent: item.priority === 'urgent' }"
          :style="{ '--subject': subjectColor(item.subject) }"
        >
          <div class="d-card-top">
            <span class="d-subject">
              <span class="d-subject-mark">{{ subjectInitial(item.subject) }}</span>
              {{ item.subject }}
            </span>
            <span v-if="item.deadline" class="d-deadline"><Icon name="clock" :size="13" />{{ item.deadline }}前完成</span>
            <span v-if="item.priority === 'urgent'" class="d-urgent">加急</span>
          </div>
          <p class="d-content">{{ item.content }}</p>
          <div v-if="item.attachments?.length" class="d-attachments">
            <a v-for="file in item.attachments" :key="file.id" :href="`/api/attachments/${file.id}/download`">
              <Icon name="link" :size="12" />{{ file.filename }}
            </a>
          </div>
          <div class="d-card-foot"><span class="d-note">{{ item.note || settings.displayMotto }}</span></div>
          <div class="d-submission">
            <span class="d-done"><b>{{ item.doneCount }}</b> / {{ board.studentCount }} 人已交</span>
            <span class="d-pending" :class="{ complete: item.pendingStudents.length === 0 && item.doneCount > 0 }">
              未交：{{ pendingNames(item) }}
            </span>
          </div>
        </article>
      </main>

      <div v-else class="d-empty">
        <Icon name="sparkles" :size="30" />
        <div>{{ isToday ? '今天' : formatDateCN(date) }}还没有作业</div>
      </div>

      <footer class="d-footer">
        <span>{{ board?.date || date }} · 共 {{ items.length }} 项作业</span>
        <span>提交情况由老师登记</span>
        <span>数据云端同步</span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.display-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: clamp(14px, 1.5vw, 24px) clamp(16px, 2.6vw, 44px) 14px;
  background: radial-gradient(1200px 700px at 12% -10%, #182052 0%, transparent 60%),
    radial-gradient(1000px 700px at 92% 8%, #0e3548 0%, transparent 58%),
    linear-gradient(160deg, #060913 0%, #0a0f24 55%, #080b1a 100%);
  color: #f4f6ff;
  display: flex;
  flex-direction: column;
  font-family: var(--font);
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  pointer-events: none;
}

.orb-1 {
  width: 520px;
  height: 520px;
  top: -220px;
  left: 8%;
  background: rgba(79, 70, 229, 0.45);
  animation: float 18s ease-in-out infinite;
}

.orb-2 {
  width: 460px;
  height: 460px;
  right: -140px;
  top: 20%;
  background: rgba(6, 182, 212, 0.28);
  animation: float 22s ease-in-out infinite reverse;
}

.orb-3 {
  width: 380px;
  height: 380px;
  left: 30%;
  bottom: -240px;
  background: rgba(147, 51, 234, 0.26);
  animation: float 26s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(30px, 40px, 0); }
}

.d-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.d-brand {
  display: flex;
  align-items: center;
  gap: 13px;
}

.d-brand-mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(124, 58, 237, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 26px rgba(79, 70, 229, 0.4);
}

.d-brand-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.d-brand-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.06em;
  margin-top: 2px;
}

.d-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.d-sync {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.d-sync .dot {
  color: #34d399;
  animation: pulse 2s infinite;
}

.d-sync.off .dot {
  color: #f87171;
  animation: none;
}

.d-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  transition: background 0.15s ease;
}

.d-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.d-hero {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: clamp(12px, 1.4vw, 20px) 0 clamp(10px, 1vw, 16px);
  flex-wrap: wrap;
}

.d-date {
  font-size: clamp(12px, 0.95vw, 16px);
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.08em;
}

.d-clock {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-top: 3px;
  font-size: clamp(42px, 5vw, 76px);
  font-weight: 750;
  line-height: 0.98;
  letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(180deg, #ffffff 20%, #b9c4ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 12px 44px rgba(129, 140, 248, 0.25);
}

.d-clock .colon {
  transform: translateY(-4%);
  padding: 0 4px;
  opacity: 0.7;
}

.d-sec {
  font-size: clamp(14px, 1.25vw, 20px);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  margin-left: 9px;
  letter-spacing: 0.04em;
}

.d-hero-side {
  display: flex;
  gap: clamp(8px, 0.9vw, 14px);
  flex-wrap: wrap;
}

.d-stat {
  min-width: 82px;
  padding: 10px 14px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(10px);
}

.d-stat b {
  display: block;
  font-size: clamp(19px, 1.8vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.d-stat span {
  font-size: clamp(10px, 0.8vw, 12px);
  color: rgba(255, 255, 255, 0.45);
}

.d-stat.accent b {
  color: #7dd3fc;
}

.d-subbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: clamp(10px, 1vw, 16px);
}

.d-date-controls {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}

.d-date-picker {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
}

.d-date-picker input {
  width: 126px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  color-scheme: dark;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.d-yesterday {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: clamp(10px, 0.8vw, 12px);
  color: rgba(255, 255, 255, 0.45);
}

.d-yesterday-title {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 700;
  margin-right: 2px;
}

.d-yesterday-item {
  padding: 4px 8px;
  border-radius: 7px;
  background: rgba(125, 211, 252, 0.07);
  border: 1px solid rgba(125, 211, 252, 0.1);
  white-space: nowrap;
}

.d-yesterday-item b { color: #7dd3fc; }
.d-yesterday-empty { color: rgba(255, 255, 255, 0.3); }

.d-error {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: #fca5a5;
  font-size: 12px;
}

.d-notice {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  margin-bottom: clamp(10px, 1vw, 14px);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 3px solid #818cf8;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
}

.d-notice.warning { border-left-color: #fbbf24; }
.d-notice.urgent { border-left-color: #f87171; }

.d-notice-tag {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(129, 140, 248, 0.18);
  color: #c7d2fe;
}

.d-notice.warning .d-notice-tag { background: rgba(251, 191, 36, 0.16); color: #fcd34d; }
.d-notice.urgent .d-notice-tag { background: rgba(248, 113, 113, 0.18); color: #fca5a5; }

.d-notice-title {
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  flex: none;
}

.d-notice-content {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-notice-count {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  font-variant-numeric: tabular-nums;
}

.notice-enter-active,
.notice-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.d-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(var(--d-columns, 3), minmax(0, 1fr));
  gap: clamp(10px, 0.9vw, 15px);
  flex: 1;
  align-content: start;
}

.d-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: clamp(13px, 1.1vw, 18px);
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.025));
  border: 1px solid rgba(255, 255, 255, 0.09);
  overflow: hidden;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.d-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(90deg, var(--subject), transparent 80%);
  opacity: 0.9;
}

.d-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.18);
}

.d-card.urgent {
  border-color: rgba(248, 113, 113, 0.35);
  background: linear-gradient(165deg, rgba(248, 113, 113, 0.1), rgba(255, 255, 255, 0.02));
  box-shadow: inset 0 0 60px rgba(248, 113, 113, 0.05);
}

.d-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.d-subject {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: clamp(16px, 1.35vw, 21px);
  font-weight: 700;
}

.d-subject-mark {
  width: clamp(30px, 2.4vw, 38px);
  height: clamp(30px, 2.4vw, 38px);
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: clamp(13px, 1.05vw, 16px);
  background: color-mix(in srgb, var(--subject) 18%, transparent);
  color: var(--subject);
  flex: none;
}

.d-deadline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
}

.d-urgent {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.16);
  color: #fca5a5;
}

.d-content {
  margin: clamp(9px, 0.8vw, 13px) 0;
  font-size: clamp(13px, 1.05vw, 17px);
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.88);
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
}

.d-attachments {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 9px;
}

.d-attachments a {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(129, 140, 248, 0.1);
  color: #c7d2fe;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-card-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  font-size: clamp(10px, 0.78vw, 12px);
  color: rgba(255, 255, 255, 0.35);
}

.d-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-submission {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 8px;
  font-size: clamp(10px, 0.78vw, 12px);
  line-height: 1.45;
}

.d-done {
  flex: none;
  color: rgba(125, 211, 252, 0.85);
  white-space: nowrap;
}

.d-done b { font-size: 1.15em; }

.d-pending {
  min-width: 0;
  color: rgba(255, 255, 255, 0.42);
  word-break: break-all;
}

.d-pending.complete { color: #6ee7b7; }

.d-empty {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 15px;
}

.d-footer {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  margin-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.02em;
}

.d-gate {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: rgba(255, 255, 255, 0.55);
  position: relative;
  z-index: 2;
}

.d-gate-btn {
  padding: 10px 22px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .d-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .d-clock { font-size: clamp(40px, 10vw, 64px); }
  .d-hero-side { width: 100%; }
  .d-stat { flex: 1; min-width: 0; }
  .d-yesterday { flex-basis: 100%; }
  .d-notice-content { display: none; }
  .d-footer { justify-content: center; text-align: center; }
}

@media (max-width: 620px) {
  .d-grid { grid-template-columns: 1fr; }
  .d-sync { display: none; }
  .d-brand-sub { letter-spacing: 0; }
  .d-date-controls { width: 100%; }
  .d-date-picker { flex: 1; }
  .d-date-picker input { width: 100%; }
}
</style>
