import React, { useState } from 'react'
import { Layout, Menu, Avatar, Badge, Dropdown, Space, Button, Tooltip } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  DashboardOutlined, BugOutlined, SafetyOutlined, AppstoreOutlined,
  BranchesOutlined, AlertOutlined, FileTextOutlined, TeamOutlined,
  BellOutlined, LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  AimOutlined, BarChartOutlined
} from '@ant-design/icons'
import { useAuthStore, useNotificationStore } from '../../store'

export const CpicLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="50" cy="50" r="48" fill="#004f9f" />
    <path d="M28 72 C32 46, 52 34, 72 34 C58 48, 48 62, 46 72 Z" fill="#ffffff" />
    <path d="M46 72 C48 56, 62 44, 76 44 C66 54, 58 64, 58 72 Z" fill="#ffffff" stroke="#004f9f" strokeWidth="1" />
    <circle cx="68" cy="70" r="7" fill="#f59e0b" />
  </svg>
)

const { Sider, Content, Header } = Layout

const menuItems = [
  // ── AI 核心模块（新增）──────────────────────────────
  {
    key: 'ai-group', label: '智能分析', type: 'group',
    children: [
      { key: '/case-analysis',   icon: <AimOutlined />, label: '案例风险分析' },
      { key: '/analytics-board', icon: <BarChartOutlined />, label: '缺陷分析看板' },
    ]
  },
  // ── 原有缺陷跟踪模块（保留）─────────────────────────
  {
    key: 'track-group', label: '缺陷跟踪', type: 'group',
    children: [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '实时质量大屏' },
      { key: '/defects',   icon: <BugOutlined />,        label: '缺陷管理' },
      { key: '/alerts',    icon: <AlertOutlined />,       label: '预警中心' },
    ]
  },
  // ── 基础配置模块（保留）─────────────────────────────
  {
    key: 'base-group', label: '系统配置', type: 'group',
    children: [
      { key: '/products', icon: <AppstoreOutlined />,  label: '保险产品' },
      { key: '/versions', icon: <BranchesOutlined />,  label: '测试版本' },
      { key: '/reports',  icon: <FileTextOutlined />,  label: '测试报告' },
      { key: '/users',    icon: <TeamOutlined />,      label: '用户管理' },
    ]
  },
]


const roleLabels = { admin: '管理员', manager: '项目经理', developer: '开发人员', tester: '测试员' }
const roleColors = { admin: '#004f9f', manager: '#0066cc', developer: '#0891b2', tester: '#059669' }

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const [collapsed, setCollapsed] = useState(false)

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const handleUserMenu = ({ key }) => {
    if (key === 'logout') { logout(); navigate('/login'); }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        style={{
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          position: 'fixed',
          height: '100vh',
          left: 0, top: 0, bottom: 0,
          overflow: 'auto',
          zIndex: 200,
        }}
      >
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div className="logo-area" style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CpicLogo size={28} />
            </div>
            {!collapsed && (
              <div>
                <div className="logo-text">产品测试缺陷预警</div>
                <div className="logo-sub">产品测试缺陷预警系统</div>
              </div>
            )}
          </div>
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', border: 'none', padding: '0 8px' }}
          theme="light"
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        {/* Header */}
        <Header className="app-header" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: 'var(--text-secondary)', fontSize: 16 }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {menuItems.find(m => m.key === location.pathname)?.label || ''}
            </span>
          </div>

          <Space size={16}>
            {/* Notifications */}
            <Tooltip title="消息通知">
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button
                  type="text"
                  icon={<BellOutlined style={{ fontSize: 18, color: unreadCount > 0 ? '#f59e0b' : 'var(--text-secondary)' }} />}
                  onClick={() => navigate('/alerts')}
                  className={unreadCount > 0 ? 'bell-active' : ''}
                />
              </Badge>
            </Tooltip>

            {/* User dropdown */}
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  size={32}
                  style={{ background: roleColors[user?.role] || 'var(--accent)', fontWeight: 600, fontSize: 13 }}
                >
                  {user?.name?.charAt(0)}
                </Avatar>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleLabels[user?.role]}</div>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* Main Content */}
        <Content style={{ background: 'var(--bg-primary)', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
