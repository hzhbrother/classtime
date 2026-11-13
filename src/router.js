import { createRouter, createWebHistory } from 'vue-router'
import { state, ensureSession } from './lib/store'

const routes = [
  {
    path: '/',
    name: 'board',
    component: () => import('./views/BoardView.vue'),
    meta: { requiresAuth: true, title: '今日作业' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { layout: false, title: '登录' }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('./views/RegisterView.vue'),
    meta: { layout: false, title: '注册' }
  },
  {
    path: '/display',
    name: 'display',
    component: () => import('./views/DisplayView.vue'),
    meta: { layout: false, title: '班级大屏' }
  },
  {
    path: '/devices',
    name: 'devices',
    component: () => import('./views/DevicesView.vue'),
    meta: { requiresAuth: true, title: '设备管理' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true, title: '个人设置' }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('./views/AdminView.vue'),
    meta: { requiresAuth: true, admin: true, title: '管理后台' }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async (to) => {
  await ensureSession()
  if (to.meta.requiresAuth && !state.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && state.user?.role !== 'super_admin') {
    return { name: 'board' }
  }
  if ((to.name === 'login' || to.name === 'register') && state.user) {
    return state.user.role === 'display' ? { name: 'display' } : { name: 'board' }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 班级作业云` : '班级作业云'
})

export default router
