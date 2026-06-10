import { create } from 'zustand'
import { authApi } from '../services/api'

export const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  loading: false,

  login: async (email, password) => {
    set({ loading: true })
    try {
      const res = await authApi.login({ email, password })
      const { token, user } = res.data.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      set({ token, user, loading: false })
      return { success: true }
    } catch (err) {
      set({ loading: false })
      return { success: false, message: err.response?.data?.message || '登录失败' }
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().token,
  hasRole: (...roles) => roles.includes(get().user?.role),
}))

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  
  setUnreadCount: (count) => set({ unreadCount: count }),
  addNotification: (notification) => set(state => ({
    notifications: [notification, ...state.notifications.slice(0, 49)],
    unreadCount: state.unreadCount + 1
  })),
  markAllRead: () => set({ unreadCount: 0 }),
}))

export const useAlertStore = create((set) => ({
  activeAlerts: [],
  addAlert: (alert) => set(state => ({
    activeAlerts: [alert, ...state.activeAlerts.slice(0, 9)]
  })),
  clearAlerts: () => set({ activeAlerts: [] }),
}))
