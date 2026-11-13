<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import { state, register, pushToast } from '../lib/store'

const router = useRouter()
const form = reactive({ username: '', name: '', password: '', confirm: '', role: 'student' })
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!form.username.trim() || !form.name.trim()) {
    error.value = '请填写账号和昵称'
    return
  }
  if (form.password.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  if (form.password !== form.confirm) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const data = await register({
      username: form.username.trim(),
      name: form.name.trim(),
      password: form.password,
      role: form.role
    })
    pushToast(`注册成功，欢迎加入 ${state.settings.className}`, 'success')
    router.replace(data.user.role === 'display' ? '/display' : '/')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-brand">
      <div class="auth-brand-content">
        <div class="brand">
          <div class="brand-mark">
            <Icon name="book" :size="20" />
          </div>
          <div>
            <div class="brand-name">{{ state.settings.siteName }}</div>
            <div class="brand-sub">CLASSBOARD CLOUD</div>
          </div>
        </div>

        <h1 class="auth-headline">
          加入班级<br />
          <em>一起把作业安排好。</em>
        </h1>
        <p class="auth-lead">
          注册后即可查看每日作业与提交情况。教师账号可发布、修改作业并登记提交，
          设备绑定后由管理员分配对应身份。
        </p>

        <div class="auth-features">
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="check" :size="15" /></span>
            <span>学生端：查看作业与提交情况</span>
          </div>
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="edit" :size="15" /></span>
            <span>教师端：发布作业、设置截止时间</span>
          </div>
          <div class="auth-feature">
            <span class="auth-feature-icon"><Icon name="shield" :size="15" /></span>
            <span>管理员可随时调整账号与设备权限</span>
          </div>
        </div>

        <div class="auth-preview">
          <div class="between" style="padding: 0 4px 10px">
            <span style="font-size: 11px; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.5)">
              {{ state.settings.className }} · 云端空间
            </span>
            <span class="badge badge-dark" style="height: 20px; font-size: 10px">开放注册</span>
          </div>
          <div class="auth-preview-row">
            <span class="auth-preview-dot" style="background: #4f46e5"><Icon name="users" :size="13" /></span>
            <div style="min-width: 0; flex: 1">
              <div class="auth-preview-title">一个账号，多端通行</div>
              <div class="auth-preview-sub">手机、电脑自动识别设备系统与 IP</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="auth-panel">
      <div class="auth-card">
        <div class="auth-mobile-brand">
          <div class="brand-mark">
            <Icon name="book" :size="18" />
          </div>
          <div>
            <div class="brand-name">{{ state.settings.siteName }}</div>
            <div class="brand-sub">CLASSBOARD CLOUD</div>
          </div>
        </div>

        <h2 class="auth-card-title">创建账号</h2>
        <p class="auth-card-sub">选择你的身份，注册后即可进入 {{ state.settings.className }} 的作业空间。</p>

        <div v-if="!state.settings.allowRegister" class="form-error">
          <Icon name="alert" :size="15" style="margin-top: 1px" />
          <span>管理员已关闭自助注册，请联系班主任创建账号。</span>
        </div>

        <form class="auth-form" @submit.prevent="submit">
          <div v-if="error" class="form-error">
            <Icon name="alert" :size="15" style="margin-top: 1px; flex: none" />
            <span>{{ error }}</span>
          </div>

          <div class="field">
            <label class="label">身份</label>
            <div class="role-pick">
              <button
                type="button"
                class="role-option"
                :class="{ active: form.role === 'student' }"
                @click="form.role = 'student'"
              >
                <Icon name="user" :size="18" style="color: var(--primary); margin-top: 2px" />
                <span>
                  <span class="role-option-title">学生</span>
                  <span class="role-option-desc">查看作业与提交情况</span>
                </span>
              </button>
              <button
                type="button"
                class="role-option"
                :class="{ active: form.role === 'teacher' }"
                @click="form.role = 'teacher'"
              >
                <Icon name="edit" :size="18" style="color: var(--accent); margin-top: 2px" />
                <span>
                  <span class="role-option-title">教师</span>
                  <span class="role-option-desc">发布与编辑每日作业</span>
                </span>
              </button>
            </div>
          </div>

          <div class="form-grid">
            <div class="field">
              <label class="label" for="reg-username">账号</label>
              <input id="reg-username" v-model="form.username" class="input" placeholder="字母/数字，3-20 位" />
            </div>
            <div class="field">
              <label class="label" for="reg-name">昵称</label>
              <input id="reg-name" v-model="form.name" class="input" placeholder="真实姓名或昵称" />
            </div>
          </div>

          <div class="field">
            <label class="label" for="reg-password">密码</label>
            <input id="reg-password" v-model="form.password" type="password" class="input" placeholder="至少 6 位" />
          </div>
          <div class="field">
            <label class="label" for="reg-confirm">确认密码</label>
            <input id="reg-confirm" v-model="form.confirm" type="password" class="input" placeholder="再次输入密码" />
          </div>

          <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="loading || !state.settings.allowRegister">
            <Icon v-if="loading" name="refresh" :size="16" class="spin" />
            {{ loading ? '正在创建…' : '注册并进入' }}
          </button>
        </form>

        <div class="auth-switch">
          已有账号？<router-link to="/login">返回登录</router-link>
        </div>
      </div>
    </section>
  </div>
</template>
