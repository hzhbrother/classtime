<script setup>
import { onMounted, reactive, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import Modal from '../../components/Modal.vue'
import { api } from '../../lib/api'
import { pushToast, confirmDialog } from '../../lib/store'
import { relativeTime } from '../../lib/format'

const notices = ref([])
const loading = ref(true)
const modalOpen = ref(false)
const editing = ref(null)
const saving = ref(false)
const error = ref('')
const form = reactive({ title: '', content: '', level: 'info', active: true })

const levelMeta = {
  info: { label: '通知', badge: 'badge-primary' },
  warning: { label: '提醒', badge: 'badge-amber' },
  urgent: { label: '紧急', badge: 'badge-red' }
}

async function load() {
  loading.value = true
  try {
    notices.value = await api.get('/notices?all=1')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, { title: '', content: '', level: 'info', active: true })
  error.value = ''
  modalOpen.value = true
}

function openEdit(notice) {
  editing.value = notice
  Object.assign(form, {
    title: notice.title,
    content: notice.content || '',
    level: notice.level,
    active: notice.active
  })
  error.value = ''
  modalOpen.value = true
}

async function save() {
  if (!form.title.trim()) {
    error.value = '请填写公告标题'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = { title: form.title.trim(), content: form.content.trim(), level: form.level, active: form.active }
    if (editing.value) await api.patch(`/admin/notices/${editing.value.id}`, payload)
    else await api.post('/admin/notices', payload)
    pushToast(editing.value ? '公告已更新' : '公告已发布', 'success')
    modalOpen.value = false
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function toggleActive(notice) {
  try {
    await api.patch(`/admin/notices/${notice.id}`, { active: !notice.active })
    pushToast(notice.active ? '公告已下线' : '公告已上线', 'info')
    await load()
  } catch (err) {
    pushToast(err.message, 'error')
  }
}

async function remove(notice) {
  const ok = await confirmDialog(`删除公告「${notice.title}」后，所有端将不再展示。`, {
    title: '删除公告？',
    danger: true
  })
  if (!ok) return
  try {
    await api.delete(`/admin/notices/${notice.id}`)
    pushToast('公告已删除', 'info')
    await load()
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
        <div class="card-title">公告管理</div>
        <div class="card-sub">公告会同步展示在学生端、手机端与班级大屏。</div>
      </div>
      <button class="btn btn-primary btn-sm" @click="openCreate">
        <Icon name="plus" :size="15" />发布公告
      </button>
    </div>

    <div v-if="loading" class="skeleton" style="height: 240px" />
    <div v-else-if="notices.length" class="col gap-10">
      <div v-for="notice in notices" :key="notice.id" class="device-row" style="align-items: flex-start">
        <span
          class="device-row-icon"
          :style="{
            background: notice.level === 'urgent' ? '#fef2f2' : notice.level === 'warning' ? '#fffbeb' : '#eef0ff',
            color: notice.level === 'urgent' ? '#dc2626' : notice.level === 'warning' ? '#d97706' : '#4f46e5'
          }"
        >
          <Icon name="bell" :size="17" />
        </span>
        <div style="flex: 1; min-width: 0">
          <div class="row gap-8 wrap">
            <span class="text-sm font-semibold">{{ notice.title }}</span>
            <span class="badge" :class="levelMeta[notice.level].badge">{{ levelMeta[notice.level].label }}</span>
            <span class="badge" :class="notice.active ? 'badge-green' : 'badge-gray'">
              <span class="dot" />{{ notice.active ? '展示中' : '已下线' }}
            </span>
          </div>
          <div class="text-sm muted" style="margin-top: 3px; line-height: 1.6">{{ notice.content }}</div>
          <div class="text-xs faint" style="margin-top: 4px">{{ relativeTime(notice.createdAt) }}发布</div>
        </div>
        <div class="row gap-4">
          <button class="btn btn-ghost btn-icon btn-sm" :title="notice.active ? '下线' : '上线'" @click="toggleActive(notice)">
            <Icon name="power" :size="14" />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" title="编辑" @click="openEdit(notice)">
            <Icon name="edit" :size="14" />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" title="删除" @click="remove(notice)">
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </div>
    </div>
    <div v-else class="empty-block">
      <div class="empty-icon"><Icon name="bell" :size="26" /></div>
      <div class="empty-title">还没有公告</div>
      <div class="empty-desc">发布一条通知，让全班第一时间看到。</div>
      <button class="btn btn-primary" @click="openCreate">发布公告</button>
    </div>

    <Modal :open="modalOpen" :title="editing ? '编辑公告' : '发布公告'" @close="modalOpen = false">
      <form @submit.prevent="save">
        <div v-if="error" class="form-error">
          <Icon name="alert" :size="15" style="margin-top: 1px" />{{ error }}
        </div>
        <div class="field">
          <label class="label">公告标题</label>
          <input v-model="form.title" class="input" maxlength="60" placeholder="例如：本周家长会安排" />
        </div>
        <div class="field">
          <label class="label">公告内容</label>
          <textarea v-model="form.content" class="textarea textarea-sm" maxlength="500" placeholder="补充说明，可留空" />
        </div>
        <div class="form-grid">
          <div class="field" style="margin-bottom: 0">
            <label class="label">级别</label>
            <select v-model="form.level" class="select">
              <option value="info">通知</option>
              <option value="warning">提醒</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div class="field" style="margin-bottom: 0">
            <label class="label">状态</label>
            <div class="check-row" style="padding: 9px 0; border: none">
              <span class="text-sm">{{ form.active ? '立即展示' : '暂不展示' }}</span>
              <button type="button" class="switch" :class="{ on: form.active }" @click="form.active = !form.active" />
            </div>
          </div>
        </div>
      </form>
      <template #footer>
        <button class="btn btn-outline" @click="modalOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <Icon v-if="saving" name="refresh" :size="15" class="spin" />{{ editing ? '保存修改' : '发布公告' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
