import React, { useState, useEffect } from 'react'
import { Form, Input, Select, Button, message } from 'antd'
import { defectApi } from '../../services/api'

const { TextArea } = Input
const { Option } = Select

export default function DefectForm({ versions, users, defect, onSuccess }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (defect) form.setFieldsValue(defect)
  }, [defect])

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
