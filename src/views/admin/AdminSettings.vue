<script setup>
import { onMounted, reactive, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import { api } from '../../lib/api'
import { pushToast, refreshMe } from '../../lib/store'

const form = reactive({
  site_name: '',
  class_name: '',
  display_motto: '',
  rollover_time: '00:05',
  auto_sync_seconds: '30',
  allow_register: '1',
  allow_public_display: '1',
  auto_carry: '0'
})
const loading = ref(true)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.get('/admin/settings')
    Object.assign(form, data)
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await api.patch('/admin/settings', { ...form })
    Object.assign(form, data)
    await refreshMe()
    pushToast('系统设置已保存并同步到所有端', 'success')
  } catch (err) {
    pushToast(err.message, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="between wrap gap-12 mb-16">
      <div>
        <div class="card-title">系统设置</div>
        <div class="card-sub">这些设置会实时同步到手机端、电脑端和班级大屏。</div>
      </div>
      <button class="btn btn-primary btn-sm" :disabled="saving || loading" @click="save">
        <Icon v-if="saving" name="refresh" :size="14" class="spin" />保存全部设置
      </button>
    </div>

    <div v-if="loading" class="skeleton" style="height: 360px" />
    <div v-else class="settings-grid">
      <div class="panel">
        <div class="card-head">
          <div>
            <div class="card-title">班级与品牌</div>
            <div class="card-sub">展示在登录页、作业板与大屏顶部</div>
          </div>
          <span class="stat-icon"><Icon name="sparkles" :size="18" /></span>
        </div>
        <div class="field">
          <label class="label">站点名称</label>
          <input v-model="form.site_name" class="input" maxlength="30" />
        </div>
        <div class="field">
          <label class="label">班级名称</label>
          <input v-model="form.class_name" class="input" maxlength="30" />
        </div>
        <div class="field" style="margin-bottom: 0">
          <label class="label">大屏标语</label>
          <input v-model="form.display_motto" class="input" maxlength="60" />
          <div class="hint">显示在班级大屏时钟下方。</div>
        </div>
      </div>

      <div class="panel">
        <div class="card-head">
          <div>
            <div class="card-title">每日自动更新</div>
            <div class="card-sub">作业板按日归档，每日自动创建新的一天</div>
          </div>
          <span class="stat-icon"><Icon name="refresh" :size="18" /></span>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="label">自动更新时刻</label>
            <input v-model="form.rollover_time" type="time" class="input" />
          </div>
          <div class="field">
            <label class="label">同步间隔</label>
            <select v-model="form.auto_sync_seconds" class="select">
              <option value="15">15 秒</option>
              <option value="30">30 秒</option>
              <option value="60">60 秒</option>
              <option value="120">120 秒</option>
            </select>
          </div>
        </div>
        <div class="check-row">
          <div>
            <div class="check-title">自动继承前一日作业</div>
            <div class="check-desc">开启后，每日自动更新时会把前一天的作业复制到新作业板，适合长期重复任务。</div>
          </div>
          <button type="button" class="switch" :class="{ on: form.auto_carry === '1' }" @click="form.auto_carry = form.auto_carry === '1' ? '0' : '1'" />
        </div>
        <div class="hint" style="margin-top: 10px">
          服务端每 30 秒检查一次日期，跨天后自动创建作业板，并向所有在线设备推送刷新事件。
        </div>
      </div>

      <div class="panel">
        <div class="card-head">
          <div>
            <div class="card-title">账号与访问</div>
            <div class="card-sub">控制注册入口与大屏公共访问</div>
          </div>
          <span class="stat-icon"><Icon name="lock" :size="18" /></span>
        </div>
        <div class="check-row">
          <div>
            <div class="check-title">允许自助注册</div>
            <div class="check-desc">关闭后仅超级管理员可在后台创建账号。</div>
          </div>
          <button type="button" class="switch" :class="{ on: form.allow_register === '1' }" @click="form.allow_register = form.allow_register === '1' ? '0' : '1'" />
        </div>
        <div class="check-row">
          <div>
            <div class="check-title">大屏公开访问</div>
            <div class="check-desc">允许未登录设备直接打开班级大屏页面，仅展示当天作业。</div>
          </div>
          <button type="button" class="switch" :class="{ on: form.allow_public_display === '1' }" @click="form.allow_public_display = form.allow_public_display === '1' ? '0' : '1'" />
        </div>
      </div>

      <div class="panel">
        <div class="card-head">
          <div>
            <div class="card-title">设备管理策略</div>
            <div class="card-sub">设备登录后自动识别系统与 IP</div>
          </div>
          <span class="stat-icon"><Icon name="shield" :size="18" /></span>
        </div>
        <div class="text-sm" style="line-height: 1.9; color: var(--text-2)">
          1. 任何设备首次访问都会记录系统、浏览器、屏幕与 IP。<br />
          2. 账号登录后自动绑定当前设备，状态变为「已绑定」。<br />
          3. 管理员可在「设备管理」中调整身份，或停用 / 删除设备。<br />
          4. 被停用的设备会立即失去会话，无法再次登录。
        </div>
        <button class="btn btn-outline btn-sm mt-12" @click="$router.push('/admin')">
          <Icon name="monitor" :size="14" />前往设备管理
        </button>
      </div>
    </div>

    <div class="row gap-10 mt-16">
      <button class="btn btn-primary" :disabled="saving" @click="save">
        <Icon v-if="saving" name="refresh" :size="15" class="spin" />保存全部设置
      </button>
      <button class="btn btn-outline" @click="load">重置为已保存值</button>
    </div>
  </div>
</template>
