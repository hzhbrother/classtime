<script setup>
import { reactive, ref, watch } from 'vue'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import { api } from '../lib/api'
import { pushToast, confirmDialog } from '../lib/store'
import { subjectColor } from '../lib/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  date: { type: String, required: true },
  item: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
const form = reactive({ subject: '语文', content: '', deadline: '21:00', priority: 'normal', note: '' })
const loading = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    if (props.item) {
      Object.assign(form, {
        subject: props.item.subject,
        content: props.item.content,
        deadline: props.item.deadline || '',
        priority: props.item.priority || 'normal',
        note: props.item.note || ''
      })
    } else {
      Object.assign(form, { subject: '语文', content: '', deadline: '21:00', priority: 'normal', note: '' })
    }
  }
)

async function save() {
  if (!form.content.trim()) {
    error.value = '请填写作业内容'
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
      note: form.note.trim()
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
  const ok = await confirmDialog('删除后该科目作业将从当日作业板移除，且学生打卡记录一并清除。', {
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
          <label class="label">截止时间</label>
          <input v-model="form.deadline" type="time" class="input" />
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

      <div class="field" style="margin-bottom: 0">
        <label class="label">老师备注 <span class="faint" style="font-weight: 400">（可选）</span></label>
        <input v-model="form.note" class="input" placeholder="例如：明早课前抽查背诵" maxlength="300" />
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
