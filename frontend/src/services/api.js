import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Request interceptor - attach JWT token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor - handle auth errors
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// Products
export const productApi = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
}

// Versions
export const versionApi = {
  list: (params) => api.get('/versions', { params }),
  get: (id) => api.get(`/versions/${id}`),
  create: (data) => api.post('/versions', data),
  update: (id, data) => api.put(`/versions/${id}`, data),
}

// Defects
export const defectApi = {
  list: (params) => api.get('/defects', { params }),
  get: (id) => api.get(`/defects/${id}`),
  create: (data) => api.post('/defects', data),
  update: (id, data) => api.put(`/defects/${id}`, data),
  changeStatus: (id, data) => api.post(`/defects/${id}/status`, data),
  assign: (id, data) => api.post(`/defects/${id}/assign`, data),
  addComment: (id, data) => api.post(`/defects/${id}/comments`, data),
}

// Alerts
export const alertApi = {
  list: (params) => api.get('/alerts', { params }),
  rules: () => api.get('/alerts/rules'),
  createRule: (data) => api.post('/alerts/rules', data),
  updateRule: (id, data) => api.put(`/alerts/rules/${id}`, data),
  deleteRule: (id) => api.delete(`/alerts/rules/${id}`),
  resolve: (id) => api.post(`/alerts/${id}/resolve`),
  triggerCheck: () => api.post('/alerts/trigger-check'),
}

// Notifications
export const notificationApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
}

// Dashboard
export const dashboardApi = {
  overview: (params) => api.get('/dashboard/overview', { params }),
  severityDistribution: (params) => api.get('/dashboard/severity-distribution', { params }),
  statusDistribution: (params) => api.get('/dashboard/status-distribution', { params }),
  trend: (params) => api.get('/dashboard/trend', { params }),
  moduleDistribution: (params) => api.get('/dashboard/module-distribution', { params }),
  rootCause: (params) => api.get('/dashboard/root-cause', { params }),
  productHealth: () => api.get('/dashboard/product-health'),
  slaAging: (params) => api.get('/dashboard/sla-aging', { params }),
  developerBacklog: (params) => api.get('/dashboard/developer-backlog', { params }),
}

// Reports
export const reportApi = {
  summary: (versionId) => api.get(`/reports/summary/${versionId}`),
}

// Users
export const userApi = {
  list: () => api.get('/users'),
}

// Cases
export const caseApi = {
  bizTemplates: () => api.get('/v1/cases/biz-templates'),
  parse: (data) => api.post('/v1/cases/parse', data),
  sessions: () => api.get('/v1/cases/sessions'),
  list: (params) => api.get('/v1/cases', { params }),
  get: (id) => api.get(`/v1/cases/${id}`),
  submitFeedback: (id, data) => api.post(`/v1/cases/${id}/feedback`, data),
  getDefectDbList: (params) => api.get('/v1/cases/defect-db/list', { params }),
  audit: (id) => api.post(`/v1/cases/${id}/audit`),
  feedbackStats: () => api.get('/v1/cases/feedback/stats')
}

export default api
