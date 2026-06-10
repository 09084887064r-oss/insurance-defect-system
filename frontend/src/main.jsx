import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import './index.css'

dayjs.locale('zh-cn')

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: '#3b82f6',
          borderRadius: 8,
          fontFamily: 'Inter, -apple-system, sans-serif',
          colorBgContainer: '#1e1e2e',
          colorBgElevated: '#262637',
          colorBgLayout: '#13131f',
          colorBorder: '#2d2d42',
          colorText: '#e2e8f0',
          colorTextSecondary: '#94a3b8',
        },
        components: {
          Layout: { siderBg: '#13131f', headerBg: '#1e1e2e' },
          Menu: { darkItemBg: '#13131f', darkSubMenuItemBg: '#13131f' },
          Card: { colorBgContainer: '#1e1e2e' },
        }
      }}
    >
      <App />
    </ConfigProvider>
  </BrowserRouter>
)
