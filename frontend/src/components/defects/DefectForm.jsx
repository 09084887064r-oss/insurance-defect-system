import React, { useState, useEffect } from 'react'
import { Form, Input, Select, Button, Tag, message } from 'antd'
import { defectApi } from '../../services/api'

const { TextArea } = Input
const { Option } = Select

export default function DefectForm({ versions, users, defect, onSuccess }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [duplicates, setDuplicates] = useState([])
  const [checking, setChecking] = useState(false)

  // 监听表单项以触发查重
  const titleValue = Form.useWatch('title', form)
  const descValue = Form.useWatch('description', form)
  const versionValue = Form.useWatch('version_id', form)

  useEffect(() => {
    if (defect) form.setFieldsValue(defect)
  }, [defect])

  // 防抖智能查重监听器
  useEffect(() => {
    // 如果是编辑模式，不执行查重，只在新建缺陷时查重
    if (defect) return

    let active = true
    const checkDup = async () => {
      if (!titleValue || titleValue.trim().length < 3) {
        setDuplicates([])
        return
      }

      setChecking(true)
      try {
        const res = await defectApi.checkDuplicate({
          title: titleValue,
          description: descValue || '',
          version_id: versionValue
        })
        if (active && res.data && res.data.success) {
          setDuplicates(res.data.data)
        }
      } catch (err) {
        console.error('查重失败:', err)
      } finally {
        if (active) setChecking(false)
      }
    }

    const timer = setTimeout(() => {
      checkDup()
    }, 600)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [titleValue, descValue, versionValue, defect])

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      if (defect) {
        await defectApi.update(defect.id, values)
        message.success('缺陷更新成功')
      } else {
        await defectApi.create(values)
        message.success('缺陷提交成功')
      }
      form.resetFields()
      setDuplicates([])
      onSuccess?.()
    } catch (e) {
      message.error(e.response?.data?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item name="version_id" label="测试版本" rules={[{ required: true, message: '请选择测试版本' }]}>
        <Select placeholder="选择测试版本">
          {versions.map(v => <Option key={v.id} value={v.id}>{v.product_name} - {v.version}</Option>)}
        </Select>
      </Form.Item>

      <Form.Item name="title" label="缺陷标题" rules={[{ required: true, message: '请输入缺陷标题' }]}>
        <Input placeholder="简明描述缺陷现象..." />
      </Form.Item>

      {/* 智能防重预警面板 */}
      {duplicates.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.04)',
          border: '1px dashed #ef4444',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 16,
          boxShadow: '0 2px 6px rgba(239,68,68,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              🚨 疑似重复缺陷预警 ({duplicates.length})
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>相似度算法匹配</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {duplicates.map(d => (
              <div key={d.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 11
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', marginRight: 10 }}>
                  <Tag color="red" style={{ fontSize: 8, lineHeight: '12px', padding: '0 3px', margin: 0, borderRadius: 2, fontWeight: 700 }}>
                    {d.score}% 相似
                  </Tag>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{d.id}</span>
                  <a href={`/defects/${d.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title}
                  </a>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                  <Tag style={{ margin: 0, fontSize: 8, borderRadius: 3, padding: '0 3px' }}>{d.version_name}</Tag>
                  <Tag className={`status-${d.status}`} style={{ margin: 0, fontSize: 8, borderRadius: 3, padding: '0 3px' }}>{d.status}</Tag>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#f43f5e', marginTop: 8, fontStyle: 'italic' }}>
            💡 提示：如果上述已有缺陷与您发现的一致，建议无需重复提交，可在已有缺陷详情页补充评论。
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item name="severity" label="严重等级" rules={[{ required: true }]}>
          <Select placeholder="选择严重等级">
            <Option value="fatal">💀 致命</Option>
            <Option value="critical">⚠️ 严重</Option>
            <Option value="major">🔶 一般</Option>
            <Option value="minor">🔹 提示</Option>
          </Select>
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select placeholder="选择优先级">
            <Option value="urgent">紧急</Option>
            <Option value="high">高</Option>
            <Option value="medium">中</Option>
            <Option value="low">低</Option>
          </Select>
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item name="module" label="所属模块">
          <Input placeholder="如：核保模块、支付模块..." />
        </Form.Item>
        <Form.Item name="environment" label="测试环境">
          <Input placeholder="如：UAT、SIT..." />
        </Form.Item>
      </div>

      <Form.Item name="description" label="缺陷描述">
        <TextArea rows={3} placeholder="详细描述缺陷现象..." />
      </Form.Item>

      <Form.Item name="steps_to_reproduce" label="复现步骤">
        <TextArea rows={3} placeholder="1. 打开系统&#10;2. 执行...&#10;3. 观察到..." />
      </Form.Item>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item name="expected_result" label="预期结果">
          <TextArea rows={2} placeholder="正常情况下应该..." />
        </Form.Item>
        <Form.Item name="actual_result" label="实际结果">
          <TextArea rows={2} placeholder="实际发生的是..." />
        </Form.Item>
      </div>

      <Form.Item name="assignee_id" label="指派给">
        <Select placeholder="选择处理人" allowClear>
          {users.filter(u => u.role === 'developer').map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
        </Select>
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', height: 42, fontWeight: 600 }}>
          {defect ? '更新缺陷' : '提交缺陷'}
        </Button>
      </Form.Item>
    </Form>
  )
}
