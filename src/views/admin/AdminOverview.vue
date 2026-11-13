<script setup>
import { computed, onMounted, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import { api } from '../../lib/api'
import { actionLabel, relativeTime } from '../../lib/format'

const emit = defineEmits(['navigate'])
const data = ref(null)
const loading = ref(true)
const error = ref('')

const maxItems = computed(() => {
  if (!data.value) return 1
  return Math.max(1, ...data.value.days.map((d) => d.items))
})

async function load() {
  loading.value = true
  try {
    data.value = await api.get('/admin/overview')
    error.value = ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function dayLabel(dateText) {
  const d = new Date(`${dateText}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="col gap-16">
      <div class="stats-grid">
        <div v-for="i in 4" :key="i" class="skeleton" style="height: 110px; border-radius: 18px" />
      </div>
      <div class="skeleton" style="height: 300px; border-radius: 18px" />
    </div>

    <div v-else-if="error" class="empty-block">
      <div class="empty-icon"><Icon name="alert" :size="26" /></div>
      <div class="empty-title">数据加载失败</div>
      <div class="empty-desc">{{ error }}</div>
      <button class="btn btn-primary" @click="load">重试</button>
    </div>

    <template v-else-if="data">
      <div class="stats-grid">
        <div class="admin-stat">
          <div class="stat-top">
            <span class="stat-icon"><Icon name="users" :size="18" /></span>
            <span class="badge badge-gray">{{ data.stats.students }} 学生</span>
          </div>
          <div class="stat-value">{{ data.stats.totalUsers }}</div>
          <div class="stat-label">注册账号总数</div>
        </div>
        <div class="admin-stat">
          <div class="stat-top">
            <span class="stat-icon blue"><Icon name="monitor" :size="18" /></span>
            <span class="badge badge-green"><span class="dot" />{{ data.stats.online }} 在线</span>
          </div>
          <div class="stat-value">{{ data.stats.devices }}</div>
          <div class="stat-label">已识别设备</div>
        </div>
        <div class="admin-stat">
          <div class="stat-top">
            <span class="stat-icon amber"><Icon name="book" :size="18" /></span>
            <span class="badge badge-amber">{{ data.stats.pendingDevices }} 待绑定</span>
          </div>
          <div class="stat-value">{{ data.stats.todayItems }}</div>
          <div class="stat-label">今日作业科目</div>
        </div>
        <div class="admin-stat">
          <div class="stat-top">
            <span class="stat-icon green"><Icon name="activity" :size="18" /></span>
            <span class="badge badge-primary">今日</span>
          </div>
          <div class="stat-value">{{ data.stats.todayProgress }}%</div>
          <div class="stat-label">全班作业完成度</div>
        </div>
      </div>

      <div class="admin-grid mt-16">
        <div class="panel">
          <div class="card-head">
            <div>
              <div class="card-title">近 7 日作业趋势</div>
              <div class="card-sub">每日作业科目数量与打卡人次</div>
            </div>
            <span class="badge badge-primary">作业量</span>
          </div>
          <div class="bar-chart">
            <div v-for="day in data.days" :key="day.date" class="bar-col">
              <div class="bar-value">{{ day.items }}</div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ height: `${Math.max(4, (day.items / maxItems) * 100)}%` }" />
              </div>
              <div class="bar-label">{{ dayLabel(day.date) }}</div>
            </div>
          </div>
          <div class="row gap-16 wrap mt-12 text-xs faint">
            <span class="row gap-4"><span class="dot" style="background: #4f46e5" />作业科次数</span>
            <span>最近 7 日累计打卡 {{ data.days.reduce((a, d) => a + d.done, 0) }} 人次</span>
          </div>
        </div>

        <div class="panel">
          <div class="card-head">
            <div class="card-title">设备系统分布</div>
            <span class="text-xs faint">{{ data.stats.devices }} 台</span>
          </div>
          <div v-for="row in data.os" :key="row.os" class="dist-row">
            <span class="dist-label">{{ row.os }}</span>
            <span class="dist-track">
              <span
                class="dist-fill"
                :style="{ width: `${Math.max(6, (row.count / Math.max(1, data.stats.devices)) * 100)}%` }"
              />
            </span>
            <span class="dist-value">{{ row.count }}</span>
          </div>

          <div class="card-head mt-16">
            <div class="card-title" style="font-size: 14px">账号角色</div>
          </div>
          <div class="row wrap gap-6">
            <span v-for="r in data.roles" :key="r.role" class="badge badge-gray">
              {{ { super_admin: '超管', teacher: '教师', student: '学生', display: '大屏' }[r.role] || r.role }}
              · {{ r.count }}
            </span>
          </div>
        </div>
      </div>

      <div class="admin-grid mt-16">
        <div class="panel">
          <div class="card-head">
            <div>
              <div class="card-title">快捷管理</div>
              <div class="card-sub">常用后台操作入口</div>
            </div>
          </div>
          <div class="row gap-10 wrap">
            <button class="btn btn-soft btn-sm" @click="emit('navigate', 'users')"><Icon name="users" :size="14" />创建账号</button>
            <button class="btn btn-soft btn-sm" @click="emit('navigate', 'devices')"><Icon name="monitor" :size="14" />分配设备身份</button>
            <button class="btn btn-soft btn-sm" @click="emit('navigate', 'homework')"><Icon name="book" :size="14" />编辑今日作业</button>
            <button class="btn btn-soft btn-sm" @click="emit('navigate', 'notices')"><Icon name="bell" :size="14" />发布公告</button>
            <button class="btn btn-soft btn-sm" @click="emit('navigate', 'settings')"><Icon name="settings" :size="14" />系统设置</button>
          </div>

          <div class="card-head mt-20">
            <div class="card-title" style="font-size: 14px">今日作业概览</div>
            <span class="badge" :class="data.todayBoard.published ? 'badge-green' : 'badge-amber'">
              {{ data.todayBoard.published ? '已发布' : '草稿' }}
            </span>
          </div>
          <div v-if="data.todayBoard.items.length" class="col gap-8">
            <div v-for="item in data.todayBoard.items.slice(0, 4)" :key="item.id" class="between" style="gap: 10px">
              <span class="row gap-8 text-sm" style="min-width: 0">
                <span class="badge badge-gray" style="height: 20px; font-size: 10px">{{ item.subject }}</span>
                <span class="truncate">{{ item.content }}</span>
              </span>
              <span class="text-xs faint nowrap">{{ item.doneCount }} 人打卡</span>
            </div>
          </div>
          <div v-else class="text-sm faint">今日暂无作业</div>
        </div>

        <div class="panel">
          <div class="card-head">
            <div class="card-title">最近操作日志</div>
            <button class="btn btn-ghost btn-sm" @click="emit('navigate', 'logs')">查看全部</button>
          </div>
          <div v-for="log in data.logs" :key="log.id" class="log-row">
            <span class="log-dot"><Icon name="activity" :size="14" /></span>
            <div style="min-width: 0; flex: 1">
              <div class="row gap-6">
                <span class="text-sm font-semibold">{{ log.username || '系统' }}</span>
                <span class="badge badge-gray" style="height: 19px; font-size: 10px">{{ actionLabel(log.action) }}</span>
              </div>
              <div class="log-detail truncate">{{ log.detail }}</div>
            </div>
            <span class="text-xs faint nowrap">{{ relativeTime(log.createdAt) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
