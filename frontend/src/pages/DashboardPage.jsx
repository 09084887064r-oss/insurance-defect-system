import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Spin, Select, Button, Tooltip } from 'antd'
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { dashboardApi, versionApi } from '../services/api'
import {
  BugIcon, UnlockIcon, FatalIcon, WarningIcon,
  TrendIcon, SuccessIcon, ClockIcon, ShieldIcon
} from '../components/VectorIcons'

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
  const [productHealth, setProductHealth] = useState([])
  const [slaAging, setSlaAging] = useState({ closed: [], open: [] })
  const [developerBacklog, setDeveloperBacklog] = useState([])
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
      const [ov, sv, st, tr, md, ph, sla, bl] = await Promise.all([
        dashboardApi.overview(params),
        dashboardApi.severityDistribution(params),
        dashboardApi.statusDistribution(params),
        dashboardApi.trend(params),
        dashboardApi.moduleDistribution(params),
        dashboardApi.productHealth(),
        dashboardApi.slaAging(params),
        dashboardApi.developerBacklog(params),
      ])
      setOverview(ov.data.data)
      setSeverityDist(sv.data.data)
      setStatusDist(st.data.data)
      setTrend(tr.data.data)
      setModuleDist(md.data.data)
      setProductHealth(ph.data.data)
      setSlaAging(sla.data.data)
      setDeveloperBacklog(bl.data.data)
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
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', opacity: 0.9 }}>{icon}</div>
      </div>
    </div>
  )

  // 1. Severity pie chart (Flat SAAS style)
  const severityColors = { fatal: '#dc2626', critical: '#ea580c', major: '#3b82f6', minor: '#10b981' }
  const severityPieOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: 'var(--text-secondary)' } },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
      label: { show: false },
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1.5 },
      emphasis: { scale: true, scaleSize: 6 },
      data: severityDist.map(d => ({
        name: SEVERITY_LABELS[d.severity] || d.severity,
        value: d.count,
        itemStyle: { color: severityColors[d.severity] || '#64748b' }
      }))
    }]
  }

  // 2. SLA Aging Pie (Flat SAAS style)
  const slaPieOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: 'var(--text-secondary)' } },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
      label: { show: false },
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1.5 },
      emphasis: { scale: true, scaleSize: 6 },
      data: (slaAging.closed || []).map((d, i) => ({
        name: d.name,
        value: d.value,
        itemStyle: { color: ['#10b981', '#06b6d4', '#3b82f6', '#8b5cf6'][i % 4] }
      }))
    }]
  }

  // 3. Developer Backlog Bar (Flat SAAS style)
  const developerBacklogOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: 'var(--text-secondary)' } },
    grid: { left: 16, right: 24, top: 30, bottom: 16, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: 'var(--text-secondary)' }, splitLine: { lineStyle: { type: 'dashed', color: 'var(--border)' } } },
    yAxis: { type: 'category', data: developerBacklog.map(d => d.developer || '未指派'), axisLabel: { color: 'var(--text-secondary)', fontSize: 11 } },
    series: [
      {
        name: '待修复总数',
        type: 'bar',
        barMaxWidth: 14,
        data: developerBacklog.map(d => d.total),
        itemStyle: {
          color: '#3b82f6',
          borderRadius: [0, 4, 4, 0]
        }
      },
      {
        name: '严重/致命',
        type: 'bar',
        barMaxWidth: 14,
        data: developerBacklog.map(d => d.highSeverity),
        itemStyle: {
          color: '#ef4444',
          borderRadius: [0, 4, 4, 0]
        }
      }
    ]
  }

  // 4. Trend line chart (Flat SAAS style)
  const allDates = [...new Set([...trend.newTrend.map(d => d.date), ...trend.closedTrend.map(d => d.date)])].sort()
  const trendOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: 'var(--text-secondary)' } },
    grid: { left: 16, right: 16, top: 40, bottom: 30, containLabel: true },
    xAxis: { type: 'category', data: allDates, axisLabel: { color: 'var(--text-secondary)', fontSize: 10 }, axisLine: { lineStyle: { color: 'var(--border)' } } },
    yAxis: { type: 'value', axisLabel: { color: 'var(--text-secondary)' }, splitLine: { lineStyle: { type: 'dashed', color: 'var(--border)' } } },
    series: [
      {
        name: '新增缺陷', type: 'line', smooth: true,
        data: allDates.map(d => trend.newTrend.find(t => t.date === d)?.count || 0),
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#ef4444' },
        lineStyle: { width: 3, color: '#ef4444' }
      },
      {
        name: '关闭缺陷', type: 'line', smooth: true,
        data: allDates.map(d => trend.closedTrend.find(t => t.date === d)?.count || 0),
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 3, color: '#10b981' }
      }
    ]
  }

  // 5. Module bar chart (Flat SAAS style)
  const moduleOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: 'var(--text-secondary)' }, splitLine: { lineStyle: { type: 'dashed', color: 'var(--border)' } } },
    yAxis: { type: 'category', data: moduleDist.map(d => d.module), axisLabel: { color: 'var(--text-secondary)', fontSize: 11 } },
    series: [
      { name: '致命', type: 'bar', stack: 'total', barMaxWidth: 16, data: moduleDist.map(d => d.fatal), itemStyle: { color: '#dc2626' } },
      { name: '严重', type: 'bar', stack: 'total', data: moduleDist.map(d => d.critical), itemStyle: { color: '#ea580c' } },
      { name: '其他', type: 'bar', stack: 'total', data: moduleDist.map(d => d.total - d.fatal - d.critical), itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] } },
    ]
  }


  return (
    <div className="page-container fade-in-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 产品测试缺陷预警系统 - 实时质量监控大屏</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>实时缺陷质量监控与交付跟踪</div>
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
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <WarningOutlined style={{ color: '#ef4444', fontSize: 18 }} className="alert-pulse" />
          <span style={{ color: '#dc2626', fontWeight: 600 }}>
            当前有 {overview.activeAlerts} 个活跃预警未处理！请及时关注缺陷质量风险。
          </span>
        </div>
      )}

      {/* Overview Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="缺陷总数" value={overview?.total} icon={<BugIcon color="var(--accent)" size={28} />} color="var(--text-primary)" className="accent" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="未关闭缺陷" value={overview?.open} icon={<UnlockIcon color="#f59e0b" size={28} />} color="#f59e0b" className="warning" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="致命缺陷" value={overview?.fatal} icon={<FatalIcon color="#ef4444" size={28} />} color="#ef4444" className="danger" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="严重缺陷" value={overview?.critical} icon={<WarningIcon color="#ea580c" size={28} />} color="#ea580c" className="danger" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="本周新增" value={overview?.weekNew} icon={<TrendIcon color="#3b82f6" size={28} />} color="#3b82f6" className="info" sub="过去7天" />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title="关闭率" value={`${overview?.closeRate}%`} icon={<SuccessIcon color="#10b981" size={28} />} color="#10b981" className="success" />
        </Col>
      </Row>

      {/* Charts Row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card title="缺陷严重度分布（实时）" style={{ height: 340 }}>
            <ReactECharts option={severityPieOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="缺陷修复时效 SLA (已关闭)" style={{ height: 340 }}>
            <ReactECharts option={slaPieOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="开发待办缺陷 Top 排行" style={{ height: 340 }}>
            <ReactECharts option={developerBacklogOption} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      {/* Charts Row 2 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="近30天缺陷收敛趋势" style={{ height: 320 }}>
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
      <Card title="🏥 产品健康度评分（实时）" style={{ marginBottom: 16 }}>
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
