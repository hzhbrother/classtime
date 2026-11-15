<script setup>
import { reactive, ref, watch } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { api } from '../lib/api'
import { pushToast, confirmDialog } from '../lib/store'
import { downloadAttachment } from '../lib/download'
import { subjectColor } from '../lib/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  date: { type: String, required: true },
  item: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
const lessons = Array.from({ length: 12 }, (_, index) => `第${index + 1}节课`)
const form = reactive({ subject: '语文', content: '', deadline: '第1节课', priority: 'normal', note: '' })
const loading = ref(false)
const uploading = ref(false)
const error = ref('')
const fileInput = ref(null)
const existingAttachments = ref([])
const newAttachments = ref([])
const removeAttachmentIds = ref([])

watch(
  () => props.open,
  (open) => {
    if (!open) {
      discardAllPending()
      return
    }
    error.value = ''
    existingAttachments.value = [...(props.item?.attachments || [])]
    newAttachments.value = []
    removeAttachmentIds.value = []
    if (props.item) {
      Object.assign(form, {
        subject: props.item.subject,
        content: props.item.content,
        deadline: lessons.includes(props.item.deadline) ? props.item.deadline : '第1节课',
        priority: props.item.priority || 'normal',
        note: props.item.note || ''
      })
    } else {
      Object.assign(form, { subject: '语文', content: '', deadline: '第1节课', priority: 'normal', note: '' })
    }
  }
)

const CHUNK_BYTES = 2.5 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('无法读取文件，请重试'))
    reader.readAsDataURL(blob)
  })
}

async function uploadOne(file) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`「${file.name}」超过 100 MB，无法上传`)
  const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_BYTES))
  const mime = file.type || 'application/octet-stream'
  const { id } = await api.post('/uploads', {
    filename: file.name,
    mime,
    size: file.size,
    chunkCount
  })
  const entry = reactive({
    uploadId: id,
    filename: file.name,
    mime,
    size: file.size,
    progress: 0,
    ready: false
  })
  newAttachments.value.push(entry)

  let cursor = 0
  let finished = 0
  async function worker() {
    while (cursor < chunkCount) {
      const index = cursor
      cursor += 1
      const blob = file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)
      await api.put(`/uploads/${id}/chunks/${index}`, { data: await blobToBase64(blob) })
      finished += 1
      entry.progress = Math.round((finished / chunkCount) * 100)
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, chunkCount) }, worker))
  entry.ready = true
}

async function onFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  error.value = ''
  uploading.value = true
  try {
    for (const file of files) await uploadOne(file)
  } catch (err) {
    error.value = err.message
  } finally {
    uploading.value = false
  }
}

async function discardUpload(entry) {
  newAttachments.value = newAttachments.value.filter((item) => item !== entry)
  if (entry.uploadId) {
    try {
      await api.delete(`/uploads/${entry.uploadId}`)
    } catch {
      /* 忽略清理失败 */
    }
  }
}

async function discardAllPending() {
  const entries = newAttachments.value.filter((item) => item.uploadId)
  newAttachments.value = []
  await Promise.all(entries.map((entry) => api.delete(`/uploads/${entry.uploadId}`).catch(() => {})))
}

function removeExisting(file) {
  removeAttachmentIds.value.push(file.id)
  existingAttachments.value = existingAttachments.value.filter((item) => item.id !== file.id)
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

async function save() {
  if (!form.content.trim()) {
    error.value = '请填写作业内容'
    return
  }
  if (uploading.value || newAttachments.value.some((file) => !file.ready)) {
    error.value = '附件还在上传中，请稍候'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const payload = {
      subject: form.subject.trim(),
      content: form.content.trim(),
      deadline: form.deadline,
      priority: form.priority,
      note: form.note.trim(),
      attachments: newAttachments.value.map(({ uploadId, filename, mime, size }) => ({ uploadId, filename, mime, size })),
      removeAttachmentIds: removeAttachmentIds.value
    }
    const board = props.item
      ? await api.patch(`/items/${props.item.id}`, payload)
      : await api.post(`/board/${props.date}/items`, payload)
    pushToast(props.item ? '作业已更新' : '作业已发布', 'success')
    emit('saved', board)
    emit('close')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function remove() {
  const ok = await confirmDialog('删除后该科目作业与附件将一并移除。', {
    title: '删除这条作业？',
    danger: true
  })
  if (!ok) return
  loading.value = true
  try {
    const board = await api.delete(`/items/${props.item.id}`)
    pushToast('作业已删除', 'info')
    emit('saved', board)
    emit('close')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Modal :open="open" :title="item ? '编辑作业' : '新增作业'" @close="emit('close')">
    <form @submit.prevent="save">
      <div v-if="error" class="form-error">
        <Icon name="alert" :size="15" style="margin-top: 1px; flex: none" />
        <span>{{ error }}</span>
      </div>

      <div class="field">
        <label class="label">科目</label>
        <div class="row wrap gap-6" style="margin-bottom: 8px">
          <button
            v-for="s in subjects"
            :key="s"
            type="button"
            class="btn btn-sm"
            :class="form.subject === s ? 'btn-primary' : 'btn-outline'"
            @click="form.subject = s"
          >
            {{ s }}
          </button>
        </div>
        <input v-model="form.subject" class="input" placeholder="或自定义科目名称" maxlength="20" />
      </div>

      <div class="field">
        <label class="label">作业内容</label>
        <textarea
          v-model="form.content"
          class="textarea"
          placeholder="例如：完成练习册 P42-43，订正周测错题并写清错因。"
          maxlength="1000"
        />
      </div>

      <div class="form-grid">
        <div class="field">
          <label class="label">完成时间</label>
          <select v-model="form.deadline" class="select">
            <option v-for="lesson in lessons" :key="lesson" :value="lesson">{{ lesson }}前完成</option>
          </select>
        </div>
        <div class="field">
          <label class="label">优先级</label>
          <div class="segmented" style="width: 100%">
            <button
              type="button"
              style="flex: 1"
              :class="{ active: form.priority === 'normal' }"
              @click="form.priority = 'normal'"
            >
              常规
            </button>
            <button
              type="button"
              style="flex: 1"
              :class="{ active: form.priority === 'urgent' }"
              @click="form.priority = 'urgent'"
            >
              加急
            </button>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="label">老师备注 <span class="faint" style="font-weight: 400">（可选）</span></label>
        <input v-model="form.note" class="input" placeholder="例如：明早课前抽查背诵" maxlength="300" />
      </div>

      <div class="field" style="margin-bottom: 0">
        <label class="label">作业附件 <span class="faint" style="font-weight: 400">（可选）</span></label>
        <input ref="fileInput" type="file" multiple style="display: none" @change="onFiles" />
        <button type="button" class="btn btn-outline btn-sm" :disabled="loading || uploading" @click="fileInput.click()">
          <Icon v-if="uploading" name="refresh" :size="14" class="spin" />
          <Icon v-else name="plus" :size="14" />{{ uploading ? '上传中…' : '选择文件' }}
        </button>
        <div class="hint">支持任意格式，单个最大 100 MB，自动并行分片上传。附件仅当天有效，次日自动清理。</div>
        <div v-if="existingAttachments.length || newAttachments.length" class="attachment-list">
          <div v-for="file in existingAttachments" :key="file.id" class="attachment-chip">
            <a href="#" class="attachment-name" :title="file.filename" @click.prevent="downloadAttachment(file)">
              <Icon name="link" :size="13" />{{ file.filename }}
            </a>
            <span class="text-xs faint">{{ formatFileSize(file.size) }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" title="保存后移除此附件" @click="removeExisting(file)">
              <Icon name="x" :size="13" />
            </button>
          </div>
          <div v-for="file in newAttachments" :key="file.uploadId" class="attachment-chip">
            <span class="attachment-name" :title="file.filename"><Icon name="link" :size="13" />{{ file.filename }}</span>
            <span class="text-xs faint">{{ file.ready ? formatFileSize(file.size) : `${file.progress}%` }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" title="移除" @click="discardUpload(file)">
              <Icon name="x" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="form.subject" class="row gap-8" style="margin-top: 14px">
        <span class="badge" :style="{ background: subjectColor(form.subject) + '16', color: subjectColor(form.subject) }">
          {{ form.subject }}
        </span>
        <span class="text-xs faint">将发布到 {{ date }} 的作业板</span>
      </div>
    </form>

    <template #footer>
      <button v-if="item" class="btn btn-danger" :disabled="loading" @click="remove">
        <Icon name="trash" :size="15" />删除
      </button>
      <span class="spacer" />
      <button class="btn btn-outline" @click="emit('close')">取消</button>
      <button class="btn btn-primary" :disabled="loading" @click="save">
        <Icon v-if="loading" name="refresh" :size="15" class="spin" />
        {{ item ? '保存修改' : '发布作业' }}
      </button>
    </template>
  </Modal>
</template>
