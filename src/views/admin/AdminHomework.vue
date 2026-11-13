<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import HomeworkDialog from '../../components/HomeworkDialog.vue'
import { api } from '../../lib/api'
import { pushToast, confirmDialog } from '../../lib/store'
import {
  todayStr,
  shiftDate,
  weekdayCN,
  formatDateCN,
  subjectColor,
  subjectInitial,
  relativeTime
} from '../../lib/format'

const date = ref(todayStr())
const board = ref(null)
const loading = ref(true)
const dialogOpen = ref(false)
const editingItem = ref(null)
const publishing = ref(false)
const isToday = computed(() => date.value === todayStr())

async function load() {
  loading.value = true
  try {
    board.value = await api.get(`/board?date=${date.value}`)
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function changeDate(offset) {
  date.value = shiftDate(date.value, offset)
  load()
}

function goToday() {
  date.value = todayStr()
  load()
}

function onDateInput(event) {
  if (event.target.value) {
    date.value = event.target.value
    load()
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

async function togglePublish() {
  if (!board.value) return
  publishing.value = true
  try {
    board.value = await api.put(`/board/${date.value}`, { published: !board.value.published })
    pushToast(board.value.published ? '作业板已发布' : '作业板已转为草稿', 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    publishing.value = false
  }
}

async function removeItem(item) {
  const ok = await confirmDialog(`将删除「${item.subject}」作业及其打卡记录。`, {
    title: '删除作业？',
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

async function carry() {
  const ok = await confirmDialog('把前一天的作业复制到当前日期。', { title: '复制前一日作业？' })
  if (!ok) return
  try {
    const res = await api.post(`/board/${date.value}/carry`)
    board.value = res.board
    pushToast(`已复制 ${res.copied} 条作业`, 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">作业管理</div>
        <div class="card-sub">
          {{ formatDateCN(date) }} {{ weekdayCN(date) }} · {{ board?.items.length || 0 }} 项作业 ·
          {{ board?.progress || 0 }}% 全班完成
        </div>
      </div>
      <div class="toolbar">
        <div class="date-nav" style="background: var(--surface-3); border-color: var(--border)">
          <button style="color: var(--muted)" @click="changeDate(-1)"><Icon name="chevronLeft" :size="14" /></button>
          <input type="date" :value="date" style="color: var(--text)" @change="onDateInput" />
          <button style="color: var(--muted)" @click="changeDate(1)"><Icon name="chevronRight" :size="14" /></button>
          <button v-if="!isToday" style="color: var(--primary)" @click="goToday">今天</button>
        </div>
        <button class="btn btn-outline btn-sm" @click="carry"><Icon name="copy" :size="14" />复制前一日</button>
        <button class="btn btn-outline btn-sm" :disabled="publishing" @click="togglePublish">
          <Icon :name="board?.published ? 'lock' : 'power'" :size="14" />{{ board?.published ? '转草稿' : '发布' }}
        </button>
        <button class="btn btn-primary btn-sm" @click="openAdd"><Icon name="plus" :size="14" />新增作业</button>
      </div>
    </div>

    <div class="row gap-8 wrap mb-16">
      <span class="badge" :class="board?.published ? 'badge-green' : 'badge-amber'">
        <span class="dot" />{{ board?.published ? '已发布' : '草稿' }}
      </span>
      <span class="badge badge-gray">{{ board?.studentCount || 0 }} 名学生</span>
      <span class="badge badge-gray">{{ board?.totalDone || 0 }} 人次打卡</span>
      <span v-if="board?.updatedAt" class="text-xs faint">最后编辑 {{ relativeTime(board.updatedAt) }}</span>
    </div>

    <div v-if="loading" class="skeleton" style="height: 280px" />

    <div v-else-if="board?.items.length" class="col gap-10">
      <div v-for="item in board.items" :key="item.id" class="device-row" style="align-items: flex-start">
        <span
          class="subject-mark"
          style="width: 38px; height: 38px; border-radius: 11px"
          :style="{ background: subjectColor(item.subject) + '18', color: subjectColor(item.subject) }"
        >
          {{ subjectInitial(item.subject) }}
        </span>
        <div style="flex: 1; min-width: 0">
          <div class="row gap-8 wrap">
            <span class="text-sm font-semibold">{{ item.subject }}</span>
            <span v-if="item.priority === 'urgent'" class="priority-pill" style="height: 20px; font-size: 10px">
              <span class="dot" />加急
            </span>
            <span v-if="item.deadline" class="badge badge-gray" style="height: 20px; font-size: 10px">
              <Icon name="clock" :size="11" />{{ item.deadline }} 截止
            </span>
            <span class="text-xs faint">{{ item.doneCount }} 人已打卡</span>
          </div>
          <div class="text-sm" style="margin-top: 4px; color: var(--text-2); line-height: 1.6; white-space: pre-wrap">{{ item.content }}</div>
          <div v-if="item.note" class="text-xs faint" style="margin-top: 4px">备注：{{ item.note }}</div>
        </div>
        <div class="row gap-4">
          <button class="btn btn-ghost btn-icon btn-sm" title="编辑" @click="openEdit(item)">
            <Icon name="edit" :size="14" />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click="removeItem(item)">
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-block">
      <div class="empty-icon"><Icon name="book" :size="26" /></div>
      <div class="empty-title">这一天还没有作业</div>
      <div class="empty-desc">新增作业，或从前后日期复制作业清单。</div>
      <button class="btn btn-primary" @click="openAdd"><Icon name="plus" :size="15" />新增作业</button>
    </div>

    <HomeworkDialog
      :open="dialogOpen"
      :date="date"
      :item="editingItem"
      @close="dialogOpen = false"
      @saved="onSaved"
    />
  </div>
</template>
