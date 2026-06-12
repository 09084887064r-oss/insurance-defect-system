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
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#004f9f',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: '#0050b3',
          borderRadius: 8,
          fontFamily: 'Inter, -apple-system, sans-serif',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#f8fafc',
          colorBgLayout: '#f8fafc',
          colorBorder: '#e2e8f0',
          colorText: '#0f172a',
          colorTextSecondary: '#475569',
        },
        components: {
          Layout: { siderBg: '#ffffff', headerBg: '#ffffff' },
          Menu: { itemBg: '#ffffff', subMenuItemBg: '#ffffff' },
          Card: { colorBgContainer: '#ffffff' },
        }
      }}
    >
      <App />
    </ConfigProvider>
  </BrowserRouter>
)
