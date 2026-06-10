import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Select, Button, Tooltip, Tag } from 'antd'
import { ReloadOutlined, WarningOutlined, BugOutlined, CheckCircleOutlined, RiseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { dashboardApi, versionApi } from '../services/api'

const SEVERITY_COLORS = { fatal: '#dc2626', critical: '#ea580c', major: '#d97706', minor: '#65a30d' }
const SEVERITY_LABELS = { fatal: '致命', critical: '严重', major: '一般', minor: '提示' }
const STATUS_LABELS = {
  new: '新建', assigned: '已指派', in_progress: '修复中',
  fixed: '已修复', pending_verify: '待验证', closed: '已关闭',
  reopened: '重新开启', rejected: '已拒绝'
}

export default function DashboardPage() {
  const [overview, setOverview] = useState(null)
  const [severityDist, setSeverityDist] = useState([])
  const [statusDist, setStatusDist] = useState([])
  const [trend, setTrend] = useState({ newTrend: [], closedTrend: [] })
  const [moduleDist, setModuleDist] = useState([])
  const [rootCause, setRootCause] = useState([])
  const [productHealth, setProductHealth] = useState([])
  const [versions, setVersions] = useState([])
  const [versionId, setVersionId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    versionApi.list().then(r => setVersions(r.data.data))
    loadData()
  }, [])

  const loadData = async (vid) => {
    setLoading(true)
    const params = vid ? { version_id: vid } : {}
    try {
      const [ov, sv, st, tr, md, rc, ph] = await Promise.all([
        dashboardApi.overview(params),
        dashboardApi.severityDistribution(params),
        dashboardApi.statusDistribution(params),
        dashboardApi.trend(params),
        dashboardApi.moduleDistribution(params),
        dashboardApi.rootCause(params),
        dashboardApi.productHealth(),
      ])
      setOverview(ov.data.data)
      setSeverityDist(sv.data.data)
      setStatusDist(st.data.data)
      setTrend(tr.data.data)
      setModuleDist(md.data.data)
      setRootCause(rc.data.data)
      setProductHealth(ph.data.data)
    } finally {
      setLoading(false)
    }
  }

  const handleVersionChange = (val) => {
    setVersionId(val)
    loadData(val)
  }

  if (loading && !overview) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spin size="large" tip="加载仪表盘数据..." />
    </div>
  )

  const StatCard = ({ title, value, icon, color, sub, className }) => (
    <div className={`stat-card ${className || ''}`} style={{ height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-value" style={{ color }}>{value ?? '-'}</div>
          <div className="stat-label">{title}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  )

  // Severity pie chart
  const severityPieOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#94a3b8' } },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
      label: { show: false },
      emphasis: { scale: true, scaleSize: 8 },
      data: severityDist.map(d => ({
        name: SEVERITY_LABELS[d.severity] || d.severity,
        value: d.count,
        itemStyle: { color: SEVERITY_COLORS[d.severity] || '#64748b' }
      }))
    }]
  }

  // Status bar chart
  const statusBarOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 16, right: 16, top: 16, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: statusDist.map(d => STATUS_LABELS[d.status] || d.status),
      axisLabel: { color: '#94a3b8', fontSize: 11, rotate: 30 },
      axisLine: { lineStyle: { color: '#2d2d42' } }
    },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
    series: [{
      type: 'bar', barMaxWidth: 36,
      data: statusDist.map(d => d.count),
      itemStyle: {
        color: (params) => {
          const colors = ['#6366f1','#3b82f6','#f59e0b','#10b981','#a78bfa','#64748b','#ef4444','#94a3b8']
          return colors[params.dataIndex % colors.length]
        },
        borderRadius: [4, 4, 0, 0]
      }
    }]
  }

  // Trend line chart
  const allDates = [...new Set([...trend.newTrend.map(d => d.date), ...trend.closedTrend.map(d => d.date)])].sort()
  const trendOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#94a3b8' } },
    grid: { left: 16, right: 16, top: 40, bottom: 30, containLabel: true },
    xAxis: { type: 'category', data: allDates, axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#2d2d42' } } },
    yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
    series: [
      {
        name: '新增缺陷', type: 'line', smooth: true,
        data: allDates.map(d => trend.newTrend.find(t => t.date === d)?.count || 0),
        itemStyle: { color: '#ef4444' },
        areaStyle: { color: 'rgba(239,68,68,0.1)' },
        lineStyle: { width: 2 }
      },
      {
        name: '关闭缺陷', type: 'line', smooth: true,
        data: allDates.map(d => trend.closedTrend.find(t => t.date === d)?.count || 0),
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16,185,129,0.1)' },
        lineStyle: { width: 2 }
      }
    ]
  }

  // Module bar chart
  const moduleOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
    yAxis: { type: 'category', data: moduleDist.map(d => d.module), axisLabel: { color: '#94a3b8', fontSize: 11 } },
    series: [
      { name: '致命', type: 'bar', stack: 'total', barMaxWidth: 20, data: moduleDist.map(d => d.fatal), itemStyle: { color: '#dc2626', borderRadius: [0,0,0,0] } },
      { name: '严重', type: 'bar', stack: 'total', data: moduleDist.map(d => d.critical), itemStyle: { color: '#ea580c' } },
      { name: '其他', type: 'bar', stack: 'total', data: moduleDist.map(d => d.total - d.fatal - d.critical), itemStyle: { color: '#4f46e5', borderRadius: [0,4,4,0] } },
    ]
  }

  // Root cause pie
  const rootCauseOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie', radius: '65%',
      label: { color: '#94a3b8', fontSize: 11 },
      data: rootCause.map((d, i) => ({
        name: d.category, value: d.count,
        itemStyle: { color: ['#4f46e5','#7c3aed','#0891b2','#059669','#d97706','#dc2626','#64748b'][i % 7] }
      }))
    }]
  }

  return (
    <div className="page-container fade-in-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 数据仪表盘</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>实时缺陷质量监控与分析</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            style={{ width: 220 }}
            placeholder="筛选测试版本"
            allowClear
            onChange={handleVersionChange}
            options={versions.map(v => ({ value: v.id, label: `${v.product_name} - ${v.version}` }))}
          />
          <Tooltip title="刷新数据">
            <Button icon={<ReloadOutlined />} onClick={() => loadData(versionId)} loading={loading} />
          </Tooltip>
        </div>
      </div>

      {/* Active alerts banner */}
      {overview?.activeAlerts > 0 && (
        <div style={{
          background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <WarningOutlined style={{ color: '#ef4444', fontSize: 18 }} className="alert-pulse" />
          <span style={{ color: '#fca5a5', fontWeight: 600 }}>
            当前有 {overview.activeAlerts} 个活跃预警未处理！请及时关注缺陷质量风险。
          </span>
          <Button size="small" danger ghost style={{ marginLeft: 'auto' }}>查看预警</Button>
        </div>
      )}

      {/* Overview Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="缺陷总数" value={overview?.total} icon="🐛" color="var(--text-primary)" className="accent" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="未关闭缺陷" value={overview?.open} icon="🔓" color="#f59e0b" className="warning" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="致命缺陷" value={overview?.fatal} icon="💀" color="#ef4444" className="danger" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="严重缺陷" value={overview?.critical} icon="⚠️" color="#ea580c" className="danger" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="本周新增" value={overview?.weekNew} icon="📈" color="#3b82f6" className="info"
            sub="过去7天" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="关闭率" value={`${overview?.closeRate}%`} icon="✅" color="#10b981" className="success" />
        </Col>
      </Row>

      {/* Charts Row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card title="缺陷严重度分布" style={{ height: 340 }}>
            <ReactECharts option={severityPieOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="缺陷状态分布" style={{ height: 340 }}>
            <ReactECharts option={statusBarOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="根因分析" style={{ height: 340 }}>
            <ReactECharts option={rootCauseOption} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      {/* Charts Row 2 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="近30天缺陷趋势" style={{ height: 320 }}>
            <ReactECharts option={trendOption} style={{ height: 240 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="模块缺陷分布 TOP 10" style={{ height: 320 }}>
            <ReactECharts option={moduleOption} style={{ height: 240 }} />
          </Card>
        </Col>
      </Row>

      {/* Product Health */}
      <Card title="🏥 产品健康度评分" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {productHealth.map(p => (
            <Col key={p.id} xs={24} sm={12} lg={8}>
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 10, padding: 16,
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${p.health_score >= 80 ? '#10b981' : p.health_score >= 60 ? '#f59e0b' : '#ef4444'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.type}</div>
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 700,
                    color: p.health_score >= 80 ? '#10b981' : p.health_score >= 60 ? '#f59e0b' : '#ef4444'
                  }}>
                    {p.health_score}
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>总计 <b style={{ color: 'var(--text-primary)' }}>{p.total}</b></span>
                  <span>致命 <b style={{ color: '#ef4444' }}>{p.fatal_open}</b></span>
                  <span>关闭 <b style={{ color: '#10b981' }}>{p.closed}</b></span>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )
}
