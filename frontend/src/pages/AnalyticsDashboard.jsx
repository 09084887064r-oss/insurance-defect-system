import React, { useEffect, useState, useRef } from 'react'
import { Card, Button, Select, Tooltip, Spin, message } from 'antd'
import { ReloadOutlined, FullscreenOutlined, FullscreenExitOutlined, DownloadOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const API = axios.create({ baseURL: 'http://localhost:3001' })
API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

const KPI_CONFIG = {
  logic:        { icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' },
  environment:  { icon: '🟠', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
  business_req: { icon: '🔵', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.25)' },
  legacy:       { icon: '🟣', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)' },
}

export default function AnalyticsDashboard() {
  const [kpi, setKpi] = useState([])
  const [charts, setCharts] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [cooldown, setCooldown] = useState(false)
  const dashboardRef = useRef()

  const CHART_IDS = ['monthly_trend', 'biz_domain', 'severity_pie', 'responsible_system', 'defect_type_bar', 'monthly_heatmap', 'product_compare']

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [kpiRes, ...chartRes] = await Promise.all([
        API.get('/api/v1/kpi'),
        ...CHART_IDS.map(id => API.get(`/api/v1/charts/${id}`))
      ])
      setKpi(kpiRes.data.data)
      const chartsMap = {}
      CHART_IDS.forEach((id, i) => { chartsMap[id] = chartRes[i].data.data })
      setCharts(chartsMap)
      setLastRefresh(new Date())
    } catch (e) {
      message.error('数据加载失败：' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    if (cooldown) { message.warning('请3秒后再刷新'); return }
    setCooldown(true)
    setRefreshing(true)
    loadAll()
    setTimeout(() => setCooldown(false), 3000)
  }

  const handleExportPDF = async () => {
    setExporting(true)
    message.loading({ content: '正在生成PDF...', key: 'pdf' })
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 1.5, backgroundColor: '#0f0f1a', useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height)
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * ratio, canvas.height * ratio)
      pdf.save(`缺陷分析看板_${new Date().toLocaleDateString('zh-CN')}.pdf`)
      message.success({ content: 'PDF导出成功', key: 'pdf' })
    } catch (e) {
      message.error({ content: 'PDF导出失败', key: 'pdf' })
    } finally {
      setExporting(false)
    }
  }

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      dashboardRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setIsFullscreen(!isFullscreen)
  }

  // ── ECharts 图表配置 ─────────────────────────────────────

  const monthlyTrendOption = () => {
    const d = charts.monthly_trend
    if (!d) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { top: 4, textStyle: { color: '#94a3b8' } },
      grid: { left: 16, right: 16, top: 40, bottom: 30, containLabel: true },
      xAxis: { type: 'category', data: d.months, axisLabel: { color: '#94a3b8', rotate: 30, fontSize: 11 }, axisLine: { lineStyle: { color: '#2d2d42' } } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
      series: d.series.map(s => ({
        name: s.name, type: 'line', data: s.data, smooth: true,
        itemStyle: { color: s.color }, lineStyle: { width: 2, color: s.color },
        areaStyle: s.name === '合计' ? undefined : { color: `${s.color}22` }
      }))
    }
  }

  const bizDomainOption = () => {
    const d = charts.biz_domain
    if (!d) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 4, textStyle: { color: '#94a3b8' } },
      grid: { left: 16, right: 16, top: 40, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: d.categories, axisLabel: { color: '#94a3b8', rotate: 25, fontSize: 11 }, axisLine: { lineStyle: { color: '#2d2d42' } } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
      series: [
        { name: '高危', type: 'bar', stack: 'a', data: d.series[0].data, barMaxWidth: 32, itemStyle: { color: '#ef4444', borderRadius: [0,0,0,0] } },
        { name: '中危', type: 'bar', stack: 'a', data: d.series[1].data, itemStyle: { color: '#f59e0b' } },
        { name: '合计', type: 'line', data: d.series[2].data, smooth: true, itemStyle: { color: '#6366f1' }, yAxisIndex: 0 },
      ]
    }
  }

  const severityPieOption = () => {
    const d = charts.severity_pie
    if (!d) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#94a3b8' } },
      series: [{
        type: 'pie', radius: ['42%', '68%'], center: ['50%', '44%'],
        label: { show: false },
        emphasis: { scale: true, scaleSize: 8 },
        data: d.items.map(item => ({ name: item.name, value: item.value, itemStyle: { color: item.color } }))
      }]
    }
  }

  const responsibleSystemOption = () => {
    const d = charts.responsible_system
    if (!d) return {}
    const items = d.items || []
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 16, right: 24, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
      yAxis: { type: 'category', data: items.map(i => i.name), axisLabel: { color: '#94a3b8', fontSize: 11 } },
      series: [
        { name: '总计', type: 'bar', data: items.map(i => i.value), barMaxWidth: 24, itemStyle: { color: '#4f46e5', borderRadius: [0, 4, 4, 0] } },
        { name: '高危', type: 'bar', data: items.map(i => i.highCount), barMaxWidth: 24, itemStyle: { color: '#ef4444', borderRadius: [0, 4, 4, 0] } },
      ]
    }
  }

  const defectTypeOption = () => {
    const d = charts.defect_type_bar
    if (!d) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 16, right: 16, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
      yAxis: { type: 'category', data: d.items.map(i => i.label), axisLabel: { color: '#94a3b8', fontSize: 11 } },
      series: [
        { name: '高危', type: 'bar', stack: 'a', data: d.items.map(i => i.high), itemStyle: { color: '#ef4444' } },
        { name: '其他', type: 'bar', stack: 'a', data: d.items.map(i => i.total - i.high), itemStyle: { color: '#4f46e5', borderRadius: [0, 4, 4, 0] } },
      ]
    }
  }

  const heatmapOption = () => {
    const d = charts.monthly_heatmap
    if (!d || !d.months || !d.matrix) return {}
    const allValues = d.matrix.flatMap(r => r.values)
    const maxVal = Math.max(...allValues, 1)
    const data = []
    d.matrix.forEach((row, rowIdx) => {
      row.values.forEach((val, colIdx) => {
        data.push([colIdx, rowIdx, val])
      })
    })
    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        formatter: p => `${d.months[p.data[0]]} · ${d.matrix[p.data[1]]?.biz_type}: ${p.data[2]} 条`
      },
      grid: { left: 80, right: 16, top: 16, bottom: 60 },
      xAxis: { type: 'category', data: d.months, axisLabel: { color: '#94a3b8', rotate: 30, fontSize: 10 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: d.matrix.map(r => r.biz_type), axisLabel: { color: '#94a3b8', fontSize: 11 }, splitArea: { show: true } },
      visualMap: { min: 0, max: maxVal, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
        inRange: { color: ['#1a1a2e', '#4f46e5', '#ef4444'] }, textStyle: { color: '#94a3b8' } },
      series: [{ type: 'heatmap', data, label: { show: maxVal < 30, color: '#fff', fontSize: 10 } }]
    }
  }

  const productCompareOption = () => {
    const d = charts.product_compare
    if (!d) return {}
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 4, textStyle: { color: '#94a3b8' } },
      grid: { left: 16, right: 16, top: 40, bottom: 30, containLabel: true },
      xAxis: { type: 'category', data: d.products, axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#2d2d42' } } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
      series: d.series.map(s => ({
        name: s.name, type: 'bar', data: s.data, barMaxWidth: 40,
        itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] }
      }))
    }
  }

  return (
    <div className="page-container fade-in-up" ref={dashboardRef}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 缺陷分析看板</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            最后刷新：{lastRefresh.toLocaleTimeString('zh-CN')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh} disabled={cooldown}>
            {cooldown ? '冷却中...' : '刷新'}
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportPDF}>
            导出 PDF
          </Button>
          <Button icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen}>
            {isFullscreen ? '退出全屏' : '全屏'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <Spin size="large" tip="加载看板数据..." />
        </div>
      ) : (
        <>
          {/* KPI 卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {kpi.map(k => {
              const cfg = KPI_CONFIG[k.key] || {}
              return (
                <div key={k.key} style={{
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  borderRadius: 12, padding: 20, transition: 'all 0.2s',
                  cursor: 'default'
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${cfg.color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: cfg.color }}>{k.value}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{k.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{k.detail}</div>
                    </div>
                    <div style={{ fontSize: 30 }}>{cfg.icon}</div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: k.trendType === 'up' ? '#ef4444' : k.trendType === 'down' ? '#10b981' : '#64748b' }}>
                      {k.trendType === 'up' ? '↑' : k.trendType === 'down' ? '↓' : '→'} {k.trend}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>环比上周</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 图表区 Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
            <Card title="📈 月度缺陷趋势分布" style={{ height: 320 }}>
              <ReactECharts option={monthlyTrendOption()} style={{ height: 240 }} />
            </Card>
            <Card title="🍩 严重程度占比" style={{ height: 320 }}>
              <ReactECharts option={severityPieOption()} style={{ height: 240 }} />
            </Card>
          </div>

          {/* 图表区 Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <Card title="🏢 业务领域缺陷分布" style={{ height: 320 }}>
              <ReactECharts option={bizDomainOption()} style={{ height: 240 }} />
            </Card>
            <Card title="🖥️ 责任系统分布" style={{ height: 320 }}>
              <ReactECharts option={responsibleSystemOption()} style={{ height: 240 }} />
            </Card>
          </div>

          {/* 图表区 Row 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <Card title="🔥 月度 × 业务类型热力图" style={{ height: 320 }}>
              <ReactECharts option={heatmapOption()} style={{ height: 240 }} />
            </Card>
            <Card title="📊 缺陷大类分布" style={{ height: 320 }}>
              <ReactECharts option={defectTypeOption()} style={{ height: 240 }} />
            </Card>
          </div>

          {/* 图表区 Row 4 */}
          <Card title="🏆 产品线缺陷对比" style={{ marginBottom: 14, height: 280 }}>
            <ReactECharts option={productCompareOption()} style={{ height: 200 }} />
          </Card>

          {/* 底部说明区 */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>📖 展开指标说明</summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['逻辑系统缺陷', '核心业务逻辑代码中的缺陷，如金额计算错误、规则不生效等'],
                  ['环境阻断缺陷', '因测试环境配置、接口超时等非业务原因导致测试阻塞的缺陷'],
                  ['业务需求缺陷', '因需求不清晰或需求变更导致实现与预期不符的缺陷'],
                  ['系统遗留缺陷', '上个版本已记录但尚未修复、在本次UAT中仍待验证的缺陷'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <b style={{ color: 'var(--text-primary)' }}>{t}：</b>{d}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  )
}
