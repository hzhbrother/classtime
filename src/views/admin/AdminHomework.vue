<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import Modal from '../../components/Modal.vue'
import HomeworkDialog from '../../components/HomeworkDialog.vue'
import { api } from '../../lib/api'
import { downloadAttachment } from '../../lib/download'
import { createHomeworkPoster } from '../../lib/poster'
import { pushToast, confirmDialog, state } from '../../lib/store'
import {
  todayStr,
  shiftDate,
  weekdayCN,
  formatDateCN,
  subjectColor,
  subjectInitial
} from '../../lib/format'

const date = ref(todayStr())
const board = ref(null)
const loading = ref(true)
const dialogOpen = ref(false)
const editingItem = ref(null)
const publishing = ref(false)
const exporting = ref(false)
const posterOpen = ref(false)
const posterUrl = ref('')
const posterDate = ref('')
let posterBlob = null
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
  const ok = await confirmDialog(`将删除「${item.subject}」作业与附件。`, {
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

function clearPoster() {
  if (posterUrl.value) URL.revokeObjectURL(posterUrl.value)
  posterUrl.value = ''
  posterBlob = null
}

function closePoster() {
  posterOpen.value = false
  clearPoster()
}

async function exportPoster() {
  if (!board.value) {
    pushToast('作业数据还没有加载完成', 'error')
    return
  }
  if (!board.value.published) {
    pushToast('请先发布作业板，再导出图片', 'error')
    return
  }
  if (!board.value.items?.length) {
    pushToast('这一天还没有可导出的作业', 'error')
    return
  }

  exporting.value = true
  try {
    const blob = await createHomeworkPoster(board.value, state.settings)
    clearPoster()
    posterBlob = blob
    posterUrl.value = URL.createObjectURL(blob)
    posterDate.value = board.value.date || date.value
    posterOpen.value = true
  } catch (err) {
    pushToast(err.message || '图片生成失败，请重试', 'error')
  } finally {
    exporting.value = false
  }
}

function downloadPoster() {
  if (!posterBlob || !posterUrl.value) return
  const className = String(state.settings.className || '班级').replace(/[\\/:*?"<>|]/g, '_')
  const link = document.createElement('a')
  link.href = posterUrl.value
  link.download = `${className}-${posterDate.value || date.value}-作业清单.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  pushToast('图片下载已开始', 'success')
}

onMounted(load)
onBeforeUnmount(clearPoster)
</script>

<template>
  <div class="panel">
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">作业管理</div>
        <div class="card-sub">
          {{ formatDateCN(date) }} {{ weekdayCN(date) }} · {{ board?.items.length || 0 }} 项作业
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
        <button class="btn btn-outline btn-sm" :disabled="exporting || loading" @click="exportPoster">
          <Icon :name="exporting ? 'refresh' : 'image'" :size="14" :class="{ spin: exporting }" />
          {{ exporting ? '正在生成' : '导出图片' }}
        </button>
        <button class="btn btn-primary btn-sm" @click="openAdd"><Icon name="plus" :size="14" />新增作业</button>
      </div>
    </div>

    <div class="row gap-8 wrap mb-16">
      <span class="badge" :class="board?.published ? 'badge-green' : 'badge-amber'">
        <span class="dot" />{{ board?.published ? '已发布' : '草稿' }}
      </span>
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
              <Icon name="clock" :size="11" />{{ item.deadline }}前完成
            </span>
          </div>
          <div class="text-sm" style="margin-top: 4px; color: var(--text-2); line-height: 1.6; white-space: pre-wrap">{{ item.content }}</div>
          <div v-if="item.note" class="text-xs faint" style="margin-top: 4px">备注：{{ item.note }}</div>
          <div v-if="item.attachments?.length" class="hw-attachments" style="margin: 8px 0 0">
            <a
              v-for="file in item.attachments"
              :key="file.id"
              href="#"
              class="hw-attachment"
              :download="file.filename"
              @click.prevent="downloadAttachment(file)"
            >
              <Icon name="link" :size="12" />{{ file.filename }}
            </a>
          </div>
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

    <Modal :open="posterOpen" title="作业海报预览" size="lg" @close="closePoster">
      <div class="poster-preview-scroll">
        <img
          v-if="posterUrl"
          class="poster-preview-image"
          :src="posterUrl"
          :alt="`${posterDate} 作业清单海报`"
        />
      </div>
      <p class="poster-preview-hint">预览与下载文件一致。手机端也可以长按图片保存到相册。</p>
      <template #footer>
        <button class="btn btn-outline" @click="closePoster">关闭</button>
        <button class="btn btn-primary" :disabled="!posterUrl" @click="downloadPoster">
          <Icon name="image" :size="15" />下载 PNG 图片
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.poster-preview-scroll {
  max-height: calc(90vh - 220px);
  overflow: auto;
  padding: 16px;
  border-radius: 16px;
  background: #e8edf5;
  text-align: center;
  scrollbar-width: thin;
}

.poster-preview-image {
  display: block;
  width: min(100%, 500px);
  height: auto;
  margin: 0 auto;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(30, 41, 59, 0.16);
}

.poster-preview-hint {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

@media (max-width: 640px) {
  .poster-preview-scroll {
    max-height: calc(92vh - 220px);
    padding: 10px;
  }
}
</style>
