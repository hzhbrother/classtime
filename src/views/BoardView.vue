<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import HomeworkDialog from '../components/HomeworkDialog.vue'
import { api } from '../lib/api'
import { state, pushToast, confirmDialog } from '../lib/store'
import { subscribeRealtime } from '../lib/realtime'
import {
  subjectColor,
  subjectInitial,
  todayStr,
  shiftDate,
  weekdayCN,
  formatDateCN
} from '../lib/format'

const date = ref(todayStr())
const board = ref(null)
const notices = ref([])
const loading = ref(true)
const error = ref('')
const dialogOpen = ref(false)
const editingItem = ref(null)
const submissionItemId = ref(null)
const busyStudent = ref(null)
const publishing = ref(false)

const isTeacher = computed(() => ['super_admin', 'teacher'].includes(state.user?.role))
const isToday = computed(() => date.value === todayStr())
const dateLabel = computed(() => `${formatDateCN(date.value)} ${weekdayCN(date.value)}`)

const items = computed(() => board.value?.items || [])
const urgentCount = computed(() => items.value.filter((i) => i.priority === 'urgent').length)
const progress = computed(() => board.value?.progress || 0)
const activeSubmissionItem = computed(() => items.value.find((item) => item.id === submissionItemId.value) || null)
const submissionStudents = computed(() => {
  if (!activeSubmissionItem.value) return []
  const submittedIds = new Set(activeSubmissionItem.value.submittedStudents.map((student) => student.id))
  return [...activeSubmissionItem.value.submittedStudents, ...activeSubmissionItem.value.pendingStudents]
    .sort((a, b) => a.id - b.id)
    .map((student) => ({ ...student, submitted: submittedIds.has(student.id) }))
})
const nearestDeadline = computed(() => {
  const list = items.value.filter((i) => i.deadline).map((i) => i.deadline)
  list.sort((a, b) => Number(a.match(/\d+/)?.[0] || 999) - Number(b.match(/\d+/)?.[0] || 999))
  return list[0] || '—'
})
const heroTitle = computed(() => (isToday.value ? '今天的作业' : `${formatDateCN(date.value)} 的作业`))
const heroSub = computed(() => {
  if (board.value?.note) return board.value.note
  return isToday.value
    ? '作业由老师统一发布，提交情况由老师逐名登记。'
    : '历史作业板已存档，可随时回看与补录。'
})

let pollTimer = null
let unsubscribe = null

async function loadBoard(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    board.value = await api.get(`/board?date=${date.value}`)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadNotices() {
  try {
    notices.value = await api.get('/notices')
  } catch {
    /* ignore */
  }
}

function changeDate(offset) {
  date.value = shiftDate(date.value, offset)
  loadBoard()
}

function goToday() {
  date.value = todayStr()
  loadBoard()
}

function onDateInput(event) {
  if (event.target.value) {
    date.value = event.target.value
    loadBoard()
  }
}

function openSubmissions(item) {
  submissionItemId.value = item.id
}

async function setSubmitted(student, submitted) {
  if (!activeSubmissionItem.value || busyStudent.value) return
  busyStudent.value = student.id
  try {
    board.value = await api.put(`/items/${activeSubmissionItem.value.id}/submissions/${student.id}`, { submitted })
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    busyStudent.value = null
  }
}

async function togglePublish() {
  if (!board.value) return
  publishing.value = true
  try {
    board.value = await api.put(`/board/${date.value}`, { published: !board.value.published })
    pushToast(board.value.published ? '作业板已发布，所有端可见' : '作业板已转为草稿', 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    publishing.value = false
  }
}

async function carryYesterday() {
  const ok = await confirmDialog('将把昨天的作业内容复制到当前作业板，已有内容不会被覆盖。', {
    title: '复制昨日作业？'
  })
  if (!ok) return
  try {
    const res = await api.post(`/board/${date.value}/carry`)
    board.value = res.board
    pushToast(`已复制 ${res.copied} 条作业`, 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

async function removeItem(item) {
  const ok = await confirmDialog(`「${item.subject}」作业、提交登记与附件将被清除。`, {
    title: '删除这条作业？',
    danger: true
  })
  if (!ok) return
  try {
    board.value = await api.delete(`/items/${item.id}`)
    pushToast('作业已删除', 'info')
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

function openAdd() {
  editingItem.value = null
  dialogOpen.value = true
}

function openEdit(item) {
  editingItem.value = item
  dialogOpen.value = true
}

function onSaved(payload) {
  board.value = payload
}

onMounted(async () => {
  await Promise.all([loadBoard(), loadNotices()])
  unsubscribe = subscribeRealtime((msg) => {
    if (msg.type === 'board' && (!msg.data?.date || msg.data.date === date.value)) loadBoard(true)
    if (msg.type === 'notices') loadNotices()
  })
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadBoard(true)
      loadNotices()
    }
  }, Math.max(Number(state.settings.autoSyncSeconds) || 30, 10) * 1000)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <div>
    <div v-if="loading && !board" class="col gap-16">
      <div class="skeleton" style="height: 200px; border-radius: 24px" />
      <div class="stats-row">
        <div v-for="i in 4" :key="i" class="skeleton" style="height: 74px; border-radius: 16px" />
      </div>
      <div class="homework-grid">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 210px; border-radius: 20px" />
      </div>
    </div>

    <div v-else-if="error && !board" class="empty-block">
      <div class="empty-icon"><Icon name="alert" :size="26" /></div>
      <div class="empty-title">作业板加载失败</div>
      <div class="empty-desc">{{ error }}</div>
      <button class="btn btn-primary" @click="loadBoard()">
        <Icon name="refresh" :size="15" />重新加载
      </button>
    </div>

    <div v-else-if="board">
      <div v-if="state.device && state.device.status === 'pending'" class="notice-item warning mb-12">
        <Icon name="alert" :size="16" class="notice-item-icon" />
        <div style="flex: 1">
          <div class="notice-item-title">当前设备尚未绑定</div>
          <div class="notice-item-content">绑定后管理员可识别设备系统、IP 并分配身份（教师端 / 学生端 / 大屏端）。</div>
        </div>
        <router-link to="/devices" class="btn btn-sm btn-outline">去绑定</router-link>
      </div>

      <section class="board-hero">
        <div class="hero-main">
          <div class="hero-eyebrow">
            <Icon name="sparkles" :size="14" />
            {{ state.settings.className }} · CLASSBOARD
          </div>
          <h1 class="hero-title">{{ heroTitle }}</h1>
          <p class="hero-sub">{{ heroSub }}</p>
          <div class="hero-meta">
            <span class="hero-chip">
              <Icon name="calendar" :size="13" />{{ dateLabel }}
            </span>
            <span class="hero-chip"><strong>{{ items.length }}</strong> 项作业</span>
            <span v-if="urgentCount" class="hero-chip"><strong>{{ urgentCount }}</strong> 项加急</span>
            <span class="hero-chip">最早完成 <strong>{{ nearestDeadline === '—' ? '—' : `${nearestDeadline}前` }}</strong></span>
            <span v-if="board.published === false" class="hero-chip" style="background: rgba(245, 158, 11, 0.22)">
              草稿状态
            </span>
          </div>
        </div>

        <div class="hero-side">
          <div class="hero-progress">
            <div class="ring" :style="{ '--value': progress }">
              <div class="ring-inner">{{ progress }}%</div>
            </div>
            <div>
              <div class="hero-progress-label">班级提交进度</div>
              <div class="hero-progress-value">{{ board.totalDone }} 人次已交</div>
            </div>
          </div>

          <div class="hero-actions">
            <template v-if="isTeacher">
              <button class="btn btn-sm btn-glass" @click="openAdd">
                <Icon name="plus" :size="14" />新增作业
              </button>
              <button class="btn btn-sm btn-glass" :disabled="publishing" @click="togglePublish">
                <Icon :name="board.published ? 'lock' : 'power'" :size="14" />
                {{ board.published ? '转为草稿' : '发布作业板' }}
              </button>
              <button class="btn btn-sm btn-glass" @click="carryYesterday">
                <Icon name="copy" :size="14" />复制昨日
              </button>
              <router-link to="/admin" class="btn btn-sm btn-glass">
                <Icon name="shield" :size="14" />管理后台
              </router-link>
            </template>
            <a href="/display" target="_blank" rel="noopener" class="btn btn-sm btn-glass">
              <Icon name="tv" :size="14" />大屏预览
            </a>
          </div>

          <div v-if="isTeacher" class="date-nav">
            <button title="前一天" @click="changeDate(-1)"><Icon name="chevronLeft" :size="14" /></button>
            <input type="date" :value="date" @change="onDateInput" />
            <button title="后一天" @click="changeDate(1)"><Icon name="chevronRight" :size="14" /></button>
            <button v-if="!isToday" @click="goToday">回到今天</button>
          </div>
        </div>
      </section>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon"><Icon name="book" :size="19" /></div>
          <div>
            <div class="stat-value">{{ items.length }}</div>
            <div class="stat-label">今日作业科目</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber"><Icon name="alert" :size="19" /></div>
          <div>
            <div class="stat-value">{{ urgentCount }}</div>
            <div class="stat-label">加急任务</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue"><Icon name="clock" :size="19" /></div>
          <div>
            <div class="stat-value">{{ nearestDeadline === '—' ? '—' : `${nearestDeadline}前` }}</div>
            <div class="stat-label">最早完成课时</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><Icon name="activity" :size="19" /></div>
          <div>
            <div class="stat-value">{{ progress }}%</div>
            <div class="stat-label">全班提交进度</div>
          </div>
        </div>
      </div>

      <div v-if="notices.length" class="notice-strip">
        <div v-for="n in notices.slice(0, 3)" :key="n.id" class="notice-item" :class="n.level">
          <Icon name="bell" :size="16" class="notice-item-icon" />
          <div style="min-width: 0">
            <div class="notice-item-title">{{ n.title }}</div>
            <div v-if="n.content" class="notice-item-content">{{ n.content }}</div>
          </div>
        </div>
      </div>

      <div class="board-toolbar">
        <div>
          <div class="section-title">{{ isToday ? '作业清单' : `${formatDateCN(date)} 作业清单` }}</div>
          <div class="section-sub">云端数据已同步 · 提交情况由老师登记</div>
        </div>
        <div class="row gap-8">
          <span class="badge" :class="board.published ? 'badge-green' : 'badge-amber'">
            <span class="dot" />{{ board.published ? '已发布' : '草稿' }}
          </span>
          <button class="btn btn-sm btn-outline" @click="loadBoard(true)">
            <Icon name="refresh" :size="14" />刷新
          </button>
          <button v-if="isTeacher" class="btn btn-sm btn-primary" @click="openAdd">
            <Icon name="plus" :size="14" />新增
          </button>
        </div>
      </div>

      <div v-if="items.length" class="homework-grid">
        <article
          v-for="item in items"
          :key="item.id"
          class="hw-card"
          :class="{ 'is-done': board.studentCount > 0 && item.doneCount === board.studentCount, 'is-urgent': item.priority === 'urgent' }"
          :style="{ '--accent': subjectColor(item.subject) }"
        >
          <div class="hw-top">
            <span
              class="subject-mark"
              :style="{ background: subjectColor(item.subject) + '18', color: subjectColor(item.subject) }"
            >
              {{ subjectInitial(item.subject) }}
            </span>
            <div style="min-width: 0">
              <div class="hw-subject">{{ item.subject }}</div>
              <div class="hw-count">{{ item.doneCount }} / {{ board.studentCount }} 人已交</div>
            </div>
            <span class="spacer" />
            <span v-if="item.priority === 'urgent'" class="priority-pill">
              <span class="dot" />加急
            </span>
          </div>

          <p class="hw-content">{{ item.content }}</p>

          <div v-if="item.attachments?.length" class="hw-attachments">
            <a v-for="file in item.attachments" :key="file.id" :href="`/api/attachments/${file.id}/download`" class="hw-attachment">
              <Icon name="link" :size="12" />{{ file.filename }}
            </a>
          </div>

          <div class="hw-meta">
            <span v-if="item.deadline" class="hw-deadline">
              <Icon name="clock" :size="12" />{{ item.deadline }}前完成
            </span>
          </div>

          <div v-if="item.note" class="hw-note">{{ item.note }}</div>

          <div class="hw-footer">
            <button v-if="isTeacher" class="btn btn-soft btn-sm" @click="openSubmissions(item)">
              <Icon name="check" :size="14" />登记提交
            </button>
            <span v-else class="text-xs faint">提交情况由老师登记</span>

            <div v-if="isTeacher" class="hw-actions">
              <button class="btn btn-ghost btn-icon btn-sm" title="编辑" @click="openEdit(item)">
                <Icon name="edit" :size="15" />
              </button>
              <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click="removeItem(item)">
                <Icon name="trash" :size="15" />
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="empty-block">
        <div class="empty-icon"><Icon name="book" :size="26" /></div>
        <div class="empty-title">这一天还没有作业</div>
        <div class="empty-desc">
          {{ isTeacher ? '新增第一条作业，或从昨天复制作业清单开始。' : '老师还没有发布作业，稍后再来看看吧。' }}
        </div>
        <div v-if="isTeacher" class="row gap-8 center">
          <button class="btn btn-primary" @click="openAdd"><Icon name="plus" :size="15" />新增作业</button>
          <button class="btn btn-outline" @click="carryYesterday"><Icon name="copy" :size="15" />复制昨日</button>
        </div>
      </div>

      <Modal
        :open="!!activeSubmissionItem"
        :title="activeSubmissionItem ? `${activeSubmissionItem.subject} · 登记提交` : '登记提交'"
        size="lg"
        @close="submissionItemId = null"
      >
        <template v-if="activeSubmissionItem">
          <div class="submission-summary">
            <div><b>{{ activeSubmissionItem.doneCount }}</b><span>人已交</span></div>
            <div><b>{{ activeSubmissionItem.pendingStudents.length }}</b><span>人未交</span></div>
            <p>点击学生姓名即可切换已交 / 未交状态，登记后立即同步到班级大屏。</p>
          </div>
          <div v-if="submissionStudents.length" class="submission-grid">
            <button
              v-for="student in submissionStudents"
              :key="student.id"
              type="button"
              class="submission-student"
              :class="{ submitted: student.submitted }"
              :disabled="busyStudent === student.id"
              @click="setSubmitted(student, !student.submitted)"
            >
              <span class="submission-avatar">{{ student.name.slice(0, 1) }}</span>
              <span class="submission-name">{{ student.name }}</span>
              <span class="submission-status">
                <Icon v-if="busyStudent === student.id" name="refresh" :size="13" class="spin" />
                <Icon v-else-if="student.submitted" name="check" :size="13" />
                {{ student.submitted ? '已交' : '未交' }}
              </span>
            </button>
          </div>
          <div v-else class="empty-block" style="border: none; padding: 28px">
            <div class="empty-title">还没有学生名单</div>
            <div class="empty-desc">请由超级管理员在用户管理中通过 Excel 导入学生。</div>
          </div>
        </template>
        <template #footer>
          <span class="text-xs faint" style="margin-right: auto">共 {{ board.studentCount }} 名学生</span>
          <button class="btn btn-primary" @click="submissionItemId = null">完成登记</button>
        </template>
      </Modal>

      <HomeworkDialog
        :open="dialogOpen"
        :date="date"
        :item="editingItem"
        @close="dialogOpen = false"
        @saved="onSaved"
      />
    </div>
  </div>
</template>
