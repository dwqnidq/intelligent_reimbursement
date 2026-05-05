import { useEffect, useState } from 'react'
import type { ColumnType } from 'antd/es/table'
import { Table, Tag, Card, Button, Descriptions, Modal, Form, Input, Select, InputNumber, DatePicker, message, Avatar, Tooltip } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, FileTextOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, SwapOutlined, LoadingOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { getReimbursementTreeList, getReimbursementTypes, searchReimbursement, updateReimbursementStatus, withdrawReimbursement, exportReimbursementsExcel } from '../api/reimbursement'
import type { ReimbursementRecord, ReimbursementListParams, ReimbursementTreeGroup, ReimbursementType } from '../api/reimbursement'
import { getApprovalRecordByReimbursement, approveRecord, rejectRecord, transferRecord } from '../api/approvalRecord'
import type { ApprovalRecordItem } from '../api/approvalRecord'
import { getEmployees } from '../api/employee'
import type { Employee } from '../api/employee'
import { useAuthStore } from '../store/useAuthStore'
import FilePreviewModal from '../components/FilePreviewModal'

const statusMap: Record<string, { color: string; label: string }> = {
  approved: { color: 'green', label: '已通过' },
  pending:  { color: 'orange', label: '审核中' },
  rejected: { color: 'red', label: '已驳回' },
  mixed: { color: 'blue', label: '混合状态' },
}

interface ActionProps {
  item: ReimbursementRecord
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRevoke: (id: string) => void
  onDetail: (item: ReimbursementRecord) => void
}

function ActionButtons({ item, onApprove, onReject, onRevoke, onDetail }: ActionProps) {
  return (
    <div className="flex gap-3 flex-wrap items-center">
      <Button type="link" size="small" onClick={() => onDetail(item)}>详情</Button>
      {item.status === 'pending' && !item.has_approval_flow && (
        <>
          <Button type="link" size="small" className="text-green-500" onClick={() => onApprove(item._id)}>通过</Button>
          <Button type="link" size="small" className="text-red-500" onClick={() => onReject(item._id)}>驳回</Button>
        </>
      )}
      {(item.status === 'approved' || item.status === 'rejected') && (
        <Button type="link" size="small" className="text-orange-500" onClick={() => onRevoke(item._id)}>撤回</Button>
      )}
    </div>
  )
}

function MobileCard({ item, canApprove, onApprove, onReject, onRevoke, onDetail, onPreview }: { item: ReimbursementRecord; canApprove: boolean; onPreview: (url: string) => void } & Omit<ActionProps, 'item'>) {
  const status = statusMap[item.status]
  const totalPrice = item.amount ?? 0
  const [showRejectReason, setShowRejectReason] = useState(false)

  const statusBorderColor = status?.color === 'green' ? '#22c55e' : status?.color === 'orange' ? '#f59e0b' : status?.color === 'red' ? '#ef4444' : '#3b82f6'

  return (
    <>
      <Card
        size="small"
        className="mb-3"
        extra={<Tag color={status?.color}>{status?.label}</Tag>}
        title={<span className="font-medium">{item.category}</span>}
        style={{ borderLeft: `3px solid ${statusBorderColor}` }}
      >
        <Descriptions
          column={2}
          size="small"
          styles={{ label: { color: 'var(--text-secondary)', fontSize: 12 }, content: { fontSize: 12 } }}
        >
          <Descriptions.Item label="申请日期">{item.apply_date ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="总价">
            <span className="text-red-500 font-medium">¥ {totalPrice.toFixed(2)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="附件">
            {item.attachments.length
              ? item.attachments.map((url, i) => (
                  <Button key={i} type="link" size="small" className="p-0 text-xs mr-1" onClick={() => onPreview(url)}>
                    附件{i + 1}
                  </Button>
                ))
              : '-'}
          </Descriptions.Item>
          {item.reject_reason && (
            <Descriptions.Item label="驳回原因" span={2}>
              {item.reject_reason.length <= 20 ? (
                item.reject_reason
              ) : (
                <span
                  className="text-[var(--color-primary)] cursor-pointer"
                  onClick={() => setShowRejectReason(true)}
                >
                  {item.reject_reason.slice(0, 20)}... <span className="text-xs">(点击查看)</span>
                </span>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>
        <div className="mt-2 flex gap-3 justify-end">
          {canApprove
            ? <ActionButtons item={item} onApprove={onApprove} onReject={onReject} onRevoke={onRevoke} onDetail={onDetail} />
            : <Button type="link" size="small" onClick={() => onDetail(item)}>详情</Button>
          }
        </div>
      </Card>

      <Modal
        title="驳回原因"
        open={showRejectReason}
        onCancel={() => setShowRejectReason(false)}
        footer={<Button onClick={() => setShowRejectReason(false)}>关闭</Button>}
        width={400}
      >
        <div className="py-4 px-2">
          <p className="text-[var(--text-primary)] whitespace-pre-wrap wrap-break-word">{item.reject_reason}</p>
        </div>
      </Modal>
    </>
  )
}

export default function ReimbursementList() {
  const [treeList, setTreeList] = useState<ReimbursementTreeGroup[]>([])
  const [flatList, setFlatList] = useState<ReimbursementRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [loading, setLoading] = useState(false)
  const canApprove = useAuthStore((s) => s.hasPermission('reimbursement:approve'))

  // 筛选
  const [filterForm] = Form.useForm()
  const [filters, setFilters] = useState<ReimbursementListParams>({})
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([])
  const [allTypes, setAllTypes] = useState<ReimbursementType[]>([])

  // 导出弹窗
  const [exportModal, setExportModal] = useState(false)
  const [exportForm] = Form.useForm()
  const [exporting, setExporting] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectId, setRejectId] = useState('')
  const [rejectForm] = Form.useForm()
  const [rejectLoading, setRejectLoading] = useState(false)

  // 详情弹窗状态
  const [detailItem, setDetailItem] = useState<ReimbursementRecord | null>(null)
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecordItem | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)

  // 审批动画状态
  const [animatingApprover, setAnimatingApprover] = useState<{
    nodeId: string; approverName: string; type: 'approve' | 'reject'; phase: 'ring' | 'icon' | 'fadeout' | 'done'
  } | null>(null)

  // 转审状态
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferFromApprover, setTransferFromApprover] = useState<{ recordId: string; nodeId: string; name: string; avatar: string } | null>(null)
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([])
  const [transferEmpLoading, setTransferEmpLoading] = useState(false)
  const [transferAnimation, setTransferAnimation] = useState<{
    nodeId: string; fromName: string; fromAvatar: string; toName: string; toAvatar: string
  } | null>(null)

  const openDetail = (item: ReimbursementRecord) => {
    setDetailItem(item)
    setApprovalRecord(null)
    setApprovalLoading(true)
    getApprovalRecordByReimbursement(item._id)
      .then((data) => setApprovalRecord(data))
      .catch(() => {})
      .finally(() => setApprovalLoading(false))
  }

  // 文件预览
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 审批动画处理
  const handleAnimatedApprove = async (recordId: string, nodeId: string, approverName: string) => {
    setAnimatingApprover({ nodeId, approverName, type: 'approve', phase: 'ring' })
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'icon' } : null)
    let success = false
    try {
      await approveRecord(recordId)
      success = true
    } catch {
      // Error already shown by interceptor
    }
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'fadeout' } : null)
    if (success) message.success('审批通过')
    await new Promise((r) => setTimeout(r, 500))
    setAnimatingApprover(null)
    if (detailItem) {
      getApprovalRecordByReimbursement(detailItem._id)
        .then((data) => setApprovalRecord(data))
        .catch(() => {})
    }
    fetchList(page)
  }

  const handleAnimatedReject = async (recordId: string, nodeId: string, approverName: string) => {
    setAnimatingApprover({ nodeId, approverName, type: 'reject', phase: 'ring' })
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'icon' } : null)
    let success = false
    try {
      await rejectRecord(recordId)
      success = true
    } catch {
      // Error already shown by interceptor
    }
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'fadeout' } : null)
    if (success) message.success('已驳回')
    await new Promise((r) => setTimeout(r, 500))
    setAnimatingApprover(null)
    if (detailItem) {
      getApprovalRecordByReimbursement(detailItem._id)
        .then((data) => setApprovalRecord(data))
        .catch(() => {})
    }
    fetchList(page)
  }

  // 转审处理
  const openTransferModal = async (recordId: string, nodeId: string, approverName: string, approverAvatar: string) => {
    setTransferFromApprover({ recordId, nodeId, name: approverName, avatar: approverAvatar })
    setTransferModalOpen(true)
    setTransferEmpLoading(true)
    try {
      const res = await getEmployees({ page_size: 200 })
      setTransferEmployees(res?.list ?? [])
    } catch {
      setTransferEmployees([])
    } finally {
      setTransferEmpLoading(false)
    }
  }

  const handleTransferSelect = async (emp: Employee) => {
    if (!transferFromApprover) return
    setTransferModalOpen(false)
    // Play chain animation
    setTransferAnimation({
      nodeId: transferFromApprover.nodeId,
      fromName: transferFromApprover.name,
      fromAvatar: transferFromApprover.avatar,
      toName: emp.name,
      toAvatar: emp.avatar || '',
    })
    // Call real API
    try {
      await transferRecord(transferFromApprover.recordId, emp._id)
      message.success(`已转审给 ${emp.name}`)
    } catch {
      setTransferAnimation(null)
    }
    // Refresh approval record + list
    if (detailItem) {
      getApprovalRecordByReimbursement(detailItem._id)
        .then((data) => setApprovalRecord(data))
        .catch(() => {})
    }
    fetchList(page)
  }

  // 驳回原因查看弹窗
  const [rejectReasonModal, setRejectReasonModal] = useState(false)
  const [viewRejectReason, setViewRejectReason] = useState('')

  const getGroupCategorySummary = (group: ReimbursementTreeGroup): string => {
    const categories = Array.from(new Set((group.children ?? []).map((x) => x.category).filter(Boolean)))
    return categories.join(' / ')
  }

  const fetchList = (p = page, f = filters) => {
    setLoading(true)
    getReimbursementTreeList({ page: p, size, ...f })
      .then((res) => {
        setFlatList([])
        setTreeList(res?.list ?? [])
        setTotal(res?.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList(1)
    getReimbursementTypes()
      .then((types) => {
        setAllTypes(types)
        setCategoryOptions(types.map((t) => ({ label: t.label, value: t.code })))
      })
      .catch(() => {})
  }, [])

  const handleSearch = () => {
    const values = filterForm.getFieldsValue()
    const dateRange: [Dayjs, Dayjs] | null = values.dateRange ?? null
    const params = {
      category: values.category || undefined,
      status: values.status || undefined,
      start_date: dateRange?.[0]?.format('YYYY-MM-DD') ?? undefined,
      end_date: dateRange?.[1]?.format('YYYY-MM-DD') ?? undefined,
    }
    setLoading(true)
    searchReimbursement(params)
      .then((res) => {
        let resultList: ReimbursementRecord[] = res?.list ?? []

        // 前端根据 amount 进行金额筛选
        const minAmount = values.amount_min
        const maxAmount = values.amount_max
        if (minAmount !== undefined || maxAmount !== undefined) {
          resultList = resultList.filter((record) => {
            const amount = record.amount ?? 0
            if (minAmount !== undefined && amount < minAmount) return false
            if (maxAmount !== undefined && amount > maxAmount) return false
            return true
          })
        }

        setFlatList(resultList)
        setTotal(resultList.length)
        setPage(1)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const handleReset = () => {
    filterForm.resetFields()
    setFilters({})
    setPage(1)
    fetchList(1, {})
  }

  const handlePageChange = (p: number) => { setPage(p); fetchList(p) }

  const handleExport = async () => {
    const values = exportForm.getFieldsValue()
    const dateRange: [Dayjs, Dayjs] | null = values.dateRange ?? null
    setExporting(true)
    try {
      await exportReimbursementsExcel({
        categories: values.categories?.length ? values.categories : undefined,
        status: values.status || undefined,
        min_amount: values.min_amount ?? undefined,
        max_amount: values.max_amount ?? undefined,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD') ?? undefined,
        end_date: dateRange?.[1]?.format('YYYY-MM-DD') ?? undefined,
      })
      message.success('导出成功')
      setExportModal(false)
    } catch {
      // 拦截器统一提示
    } finally {
      setExporting(false)
    }
  }

  const handleApprove = (id: string) => {
    updateReimbursementStatus(id, { status: 'approved' })
      .then(() => fetchList(page))
      .catch(() => {})
  }

  const handleReject = (id: string) => {
    setRejectId(id)
    setRejectModal(true)
  }

  const handleRejectConfirm = () => {
    rejectForm.validateFields().then(({ rejectReason }) => {
      setRejectLoading(true)
      updateReimbursementStatus(rejectId, { status: 'rejected', reject_reason: rejectReason })
        .then(() => {
          setRejectModal(false)
          rejectForm.resetFields()
          fetchList(page)
        })
        .catch(() => {})
        .finally(() => setRejectLoading(false))
    })
  }

  const handleRevoke = (id: string) => {
    Modal.confirm({
      title: '确认撤回',
      content: '确定要撤回该报销申请吗？',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => withdrawReimbursement(id).then(() => fetchList(page)).catch(() => {}),
    })
  }

  const outerColumns = [
    Table.EXPAND_COLUMN,
    {
      title: '费用类型',
      render: (_: unknown, record: ReimbursementTreeGroup) => {
        const text = getGroupCategorySummary(record)
        return (
          <span
            title={text}
            className="inline-block max-w-[260px] truncate align-bottom"
          >
            {text}
          </span>
        )
      },
    },
    { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
    {
      title: '金额',
      render: (_: unknown, record: ReimbursementTreeGroup) => `¥ ${(record.total_amount ?? 0).toFixed(2)}`,
    },
  ]

  const detailColumns: ColumnType<ReimbursementRecord>[] = [
    {
      title: '费用类型',
      dataIndex: 'category',
      render: (v: string) => v ?? '-',
    },
    { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
    {
      title: '金额',
      render: (_: unknown, record: ReimbursementRecord) => `¥ ${(record.amount ?? 0).toFixed(2)}`,
    },
    {
      title: '超额',
      render: (_: unknown, record: ReimbursementRecord) =>
        record.is_over_limit ? <Tag color="orange">超额</Tag> : <Tag color="default">正常</Tag>,
    },
    {
      title: '附件',
      render: (_: unknown, record: ReimbursementRecord) => {
        const v = record.attachments ?? []
        return v.length ? (
          <div className="flex flex-wrap gap-1">
            {v.map((url, i) => (
              <Button
                key={i}
                type="link"
                size="small"
                className="p-0 text-xs"
                onClick={() => setPreviewUrl(url)}
              >
                附件{i + 1}
              </Button>
            ))}
          </div>
        ) : '-'
      },
    },
    {
      title: '状态',
      render: (_: unknown, record: ReimbursementRecord) =>
        <Tag color={statusMap[record.status]?.color}>{statusMap[record.status]?.label}</Tag>,
    },
    {
      title: '驳回原因',
      render: (_: unknown, record: ReimbursementRecord) => {
        const v = record.reject_reason
        if (!v) return '-'
        if (v.length <= 20) return v
        return (
          <span
            className="text-[var(--color-primary)] cursor-pointer hover:underline"
            onClick={() => {
              setViewRejectReason(v)
              setRejectReasonModal(true)
            }}
          >
            {v.slice(0, 20)}... <span className="text-xs">(点击查看)</span>
          </span>
        )
      }
    },
    {
      title: '操作',
      render: (_: unknown, record: ReimbursementRecord) =>
        canApprove
          ? <ActionButtons item={record} onApprove={handleApprove} onReject={handleReject} onRevoke={handleRevoke} onDetail={openDetail} />
          : <Button type="link" size="small" className="p-0" onClick={() => openDetail(record)}>详情</Button>,
    }
  ]

  return (
    <Card className="w-full flex flex-col flex-1">
      {/* 标题 + 操作按钮 */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
            <FileTextOutlined className="text-[var(--color-primary)] text-sm" />
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">报销记录</h2>
        </div>
        {canApprove && (
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => setExportModal(true)}>
            导出
          </Button>
        )}
      </div>

      {/* 筛选栏 */}
      <div className="bg-[var(--bg-page)] rounded-xl p-4 mb-5 border border-[var(--border-color)]">
        <Form form={filterForm} layout="inline">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
            <Form.Item name="category" className="mb-0 col-span-1">
              <Select placeholder="费用类型" options={categoryOptions} allowClear className="w-full" />
            </Form.Item>
            <Form.Item name="status" className="mb-0 col-span-1">
              <Select placeholder="状态" allowClear className="w-full"
                options={[
                  { label: '审核中', value: 'pending' },
                  { label: '已通过', value: 'approved' },
                  { label: '已驳回', value: 'rejected' },
                ]} />
            </Form.Item>
            {canApprove && (
              <Form.Item name="applicant" className="mb-0 col-span-1">
                <Input placeholder="申请人" allowClear />
              </Form.Item>
            )}
            <Form.Item name="amount_min" className="mb-0 col-span-1">
              <InputNumber placeholder="最小总价" min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="amount_max" className="mb-0 col-span-1">
              <InputNumber placeholder="最大总价" min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="dateRange" className="mb-0 col-span-2 sm:col-span-1 lg:col-span-2">
              <DatePicker.RangePicker className="w-full" />
            </Form.Item>
            <Form.Item className="mb-0 col-span-2 sm:col-span-3 lg:col-span-4">
              <div className="flex gap-2">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      {/* 桌面端：表格 */}
      <div className="hidden md:block">
        {flatList.length > 0 ? (
          <Table
            dataSource={flatList}
            rowKey={(row) => row._id}
            columns={detailColumns}
            loading={loading}
            pagination={false}
            size="middle"
          />
        ) : (
          <Table
            dataSource={treeList}
            childrenColumnName="__antdTreeChildrenUnused__"
            rowKey={(row) => row._id}
            columns={outerColumns}
            loading={loading}
            pagination={{ current: page, pageSize: size, total, onChange: handlePageChange, showTotal: (t) => `共 ${t} 个提交批次` }}
            expandable={{
              expandedRowRender:(record) => {
                const rows = record.children ?? []
                if (!rows.length) return null
                return (
                  <Table
                    dataSource={rows.map((x: ReimbursementRecord) => ({ ...x, key: x._id }))}
                    rowKey={(row) => row._id}
                    columns={detailColumns}
                    pagination={false}
                    size="small"
                  />
                )
              },
              rowExpandable: (record) => (record.children?.length ?? 0) > 0,
            }}
            size="middle"
          />
        )}
      </div>

      {/* 移动端：卡片列表 */}
      <div className="block md:hidden">
        {(flatList.length > 0 ? flatList : treeList.flatMap((g) => g.children ?? [])).map((item) => (
          <MobileCard key={item._id} item={item} canApprove={canApprove}
            onApprove={handleApprove} onReject={handleReject} onRevoke={handleRevoke} onDetail={openDetail}
            onPreview={setPreviewUrl} />
        ))}
        <div className="text-center text-xs text-[var(--text-tertiary)] mt-2">共 {total} {flatList.length > 0 ? '条' : '个提交批次'}</div>
      </div>

      {/* 导出弹窗 */}
      <Modal
        title="导出报销记录"
        open={exportModal}
        onCancel={() => { setExportModal(false); exportForm.resetFields() }}
        onOk={handleExport}
        okText="确认导出"
        cancelText="取消"
        okButtonProps={{ loading: exporting }}
        width={480}
      >
        <Form form={exportForm} layout="vertical" className="mt-4">
          <Form.Item name="categories" label="报销类型（不选则导出全部）">
            <Select
              mode="multiple"
              placeholder="可多选，不选则导出全部类型"
              options={allTypes.map((t) => ({ label: t.label, value: t.code }))}
              allowClear
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="status" label="状态（不选则导出全部状态）">
            <Select placeholder="不选则导出全部状态" allowClear className="w-full"
              options={[
                { label: '审核中', value: 'pending' },
                { label: '已通过', value: 'approved' },
                { label: '已驳回', value: 'rejected' },
              ]} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="min_amount" label="最小金额" className="mb-0">
              <InputNumber placeholder="不限" min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="max_amount" label="最大金额" className="mb-0">
              <InputNumber placeholder="不限" min={0} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="dateRange" label="申请日期范围" className="mt-3 mb-0">
            <DatePicker.RangePicker className="w-full" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回原因弹窗 */}
      <Modal
        title="填写驳回原因"
        open={rejectModal}
        onOk={handleRejectConfirm}
        onCancel={() => { setRejectModal(false); rejectForm.resetFields() }}
        okText="确定驳回"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: rejectLoading }}
      >
        <Form form={rejectForm} layout="vertical" className="mt-4">
          <Form.Item
            name="rejectReason"
            label="驳回原因"
            rules={[{ required: true, message: '请填写驳回原因' }]}
          >
            <Input.TextArea rows={3} placeholder="请输入驳回原因，如：缺少发票" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看驳回原因弹窗 */}
      <Modal
        title="驳回原因"
        open={rejectReasonModal}
        onCancel={() => setRejectReasonModal(false)}
        footer={<Button onClick={() => setRejectReasonModal(false)}>关闭</Button>}
        width={480}
      >
        <div className="py-4 px-2">
          <p className="text-[var(--text-primary)] whitespace-pre-wrap wrap-break-word">{viewRejectReason}</p>
        </div>
      </Modal>

      {/* 详情弹窗 — 三栏布局 */}
      <Modal
        title="报销详情"
        open={!!detailItem}
        onCancel={() => setDetailItem(null)}
        footer={<Button onClick={() => setDetailItem(null)}>关闭</Button>}
        width="min(1200px, 95vw)"
        styles={{ body: { padding: '16px 24px' } }}
      >
        {detailItem && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左栏：报销基本信息 */}
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">报销信息</p>
              <Descriptions column={1} size="small" bordered styles={{ label: { width: 90 } }}>
                <Descriptions.Item label="费用类型">{detailItem.category}</Descriptions.Item>
                {detailItem.applicant_name && (
                  <Descriptions.Item label="申请人">{detailItem.applicant_name}</Descriptions.Item>
                )}
                <Descriptions.Item label="申请日期">{detailItem.apply_date ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="金额">
                  <span className="text-red-500 font-medium">
                    ¥ {(detailItem.amount ?? 0).toFixed(2)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="超额情况">
                  {detailItem.is_over_limit
                    ? <Tag color="orange">超额</Tag>
                    : <Tag color="default">正常</Tag>
                  }
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusMap[detailItem.status]?.color}>{statusMap[detailItem.status]?.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="驳回原因">{detailItem.reject_reason ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="审批人">{detailItem.approver ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="审批时间">{detailItem.approved_at ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="附件">
                  {detailItem.attachments.length
                    ? detailItem.attachments.map((url, i) => (
                        <Button
                          key={i}
                          type="link"
                          size="small"
                          className="p-0 block text-left"
                          onClick={() => setPreviewUrl(url)}
                        >
                          附件{i + 1}
                        </Button>
                      ))
                    : '-'}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* 中栏：报销明细 */}
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">报销明细</p>
              {detailItem.detail && detailItem.detail.length > 0 ? (
                <Descriptions column={1} size="small" bordered styles={{ label: { width: 90 } }}>
                  {detailItem.detail.map((item, i) => (
                    <Descriptions.Item key={i} label={item.label}>
                      {item.value ?? '-'}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ) : (
                <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">暂无明细</div>
              )}
            </div>

            {/* 右栏：审批流程 */}
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">审批流程</p>
              {approvalLoading ? (
                <div className="text-center text-[var(--text-tertiary)] text-sm py-4">
                  加载审批流程中...
                </div>
              ) : approvalRecord?.flow_snapshot?.nodes?.length ? (
                <div className="space-y-0">
                  {approvalRecord.flow_snapshot.nodes.map((node, idx) => {
                    const isCurrent = idx === approvalRecord.cur_node_idx && approvalRecord.status === 'pending'
                    const isPast = idx < approvalRecord.cur_node_idx || approvalRecord.status === 'approved'
                    const isRejected = approvalRecord.status === 'rejected' && idx === approvalRecord.cur_node_idx

                    const statusIcon = isRejected
                      ? <CloseCircleOutlined className="text-red-500 text-lg" />
                      : isPast
                        ? <CheckCircleOutlined className="text-green-500 text-lg" />
                        : isCurrent
                          ? <ClockCircleOutlined className="text-blue-500 text-lg animate-pulse" />
                          : <ClockCircleOutlined className="text-[var(--text-tertiary)] text-lg" />

                    const actionsForNode = approvalRecord.actions.filter((a) => a.node_id === node.node_id)

                    return (
                      <div key={node.node_id} className="flex gap-3">
                        {/* Timeline */}
                        <div className="flex flex-col items-center">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-current flex-shrink-0"
                            style={{
                              borderColor: isRejected ? '#ef4444' : isPast ? '#22c55e' : isCurrent ? '#3b82f6' : 'var(--border-color)',
                              background: isRejected ? '#fef2f2' : isPast ? '#f0fdf4' : isCurrent ? '#eff6ff' : 'transparent',
                            }}
                          >
                            {statusIcon}
                          </div>
                          {isPast && idx < approvalRecord.flow_snapshot.nodes.length - 1 && (
                            <div className="w-0.5 h-6 bg-green-500" />
                          )}
                          {!isPast && idx < approvalRecord.flow_snapshot.nodes.length - 1 && (
                            <div className="w-0.5 h-6 bg-transparent" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-4 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              节点 {idx + 1}
                            </span>
                            <Tag color={node.sign_type === 'countersign' ? 'blue' : 'cyan'} className="text-xs">
                              {node.sign_type === 'countersign' ? '会签' : '或签'}
                            </Tag>
                            {isRejected && <Tag color="red" className="text-xs">已驳回</Tag>}
                            {isCurrent && <Tag color="processing" className="text-xs">审批中</Tag>}
                          </div>

                          {/* Approvers */}
                          <div className="flex flex-wrap items-start gap-3 mb-1">
                            {node.approvers.map((approver, aIdx) => {
                              const hasApproved = node.approved_by?.includes(approver.name)
                              const hasRejected = actionsForNode.some(
                                (a) => a.approver_name === approver.name && a.action === 'reject',
                              )
                              const isAnimating = animatingApprover?.nodeId === node.node_id && animatingApprover?.approverName === approver.name
                              const isCurrentNode = isCurrent

                              const pillBg = isAnimating && (animatingApprover?.phase === 'icon' || animatingApprover?.phase === 'fadeout')
                                ? (animatingApprover.type === 'approve'
                                  ? 'bg-green-50 border-green-200 text-green-600'
                                  : 'bg-red-50 border-red-200 text-red-600')
                                : hasRejected
                                  ? 'bg-red-50 border-red-200 text-red-600'
                                  : hasApproved
                                    ? 'bg-green-50 border-green-200 text-green-600'
                                    : 'bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-secondary)]'

                              const isTransferFrom = transferAnimation?.fromName === approver.name

                              return (
                                <div key={aIdx} className="flex items-center gap-1.5 flex-wrap">
                                  <Tooltip
                                    title={`${approver.dept_name ?? ''}${approver.dept_name && approver.position ? ' / ' : ''}${approver.position ?? ''}`}
                                  >
                                    <div className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs border transition-colors duration-300 ${pillBg}`}>
                                      <div className="relative flex-shrink-0" style={{ width: 22, height: 22 }}>
                                        <Avatar
                                          size={18}
                                          src={approver.avatar}
                                          icon={<UserOutlined />}
                                          style={{ position: 'absolute', top: 2, left: 2 }}
                                        />
                                        {isAnimating && animatingApprover?.phase === 'ring' && (
                                          <svg
                                            className="absolute top-0 left-0"
                                            width="22"
                                            height="22"
                                            viewBox="0 0 22 22"
                                            style={{ pointerEvents: 'none' }}
                                          >
                                            <circle
                                              cx="11"
                                              cy="11"
                                              r="9"
                                              fill="none"
                                              stroke={animatingApprover.type === 'approve' ? '#22c55e' : '#ef4444'}
                                              strokeWidth="2"
                                              strokeDasharray="56.5"
                                              strokeDashoffset="56.5"
                                              strokeLinecap="round"
                                              className="approval-progress-ring"
                                            />
                                          </svg>
                                        )}
                                        {isAnimating && (animatingApprover?.phase === 'icon' || animatingApprover?.phase === 'fadeout') && (
                                          <div className={`absolute -top-1 -right-1 z-10 ${animatingApprover.phase === 'fadeout' ? 'approval-icon-fadeout' : 'approval-icon-appear'}`}>
                                            {animatingApprover.type === 'approve' ? (
                                              <CheckCircleOutlined className="text-green-500 text-xs" />
                                            ) : (
                                              <CloseCircleOutlined className="text-red-500 text-xs" />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <span className="font-medium">{approver.name}</span>
                                      {hasApproved && !isAnimating && <CheckCircleOutlined className="text-green-500 text-[10px]" />}
                                      {hasRejected && !isAnimating && <CloseCircleOutlined className="text-red-500 text-[10px]" />}
                                    </div>
                                  </Tooltip>

                                  {/* Action buttons for current node approvers */}
                                  {isCurrentNode && approvalRecord?.status === 'pending' && !hasApproved && !hasRejected && !isAnimating && (
                                    <div className="flex items-center gap-1.5">
                                      <Tooltip title="通过">
                                        <CheckCircleOutlined
                                          className="text-green-500 text-base cursor-pointer hover:text-green-400 hover:bg-green-50 rounded-full p-1 transition-all"
                                          onClick={() => handleAnimatedApprove(approvalRecord._id, node.node_id, approver.name)}
                                        />
                                      </Tooltip>
                                      <Tooltip title="驳回">
                                        <CloseCircleOutlined
                                          className="text-red-500 text-base cursor-pointer hover:text-red-400 hover:bg-red-50 rounded-full p-1 transition-all"
                                          onClick={() => handleAnimatedReject(approvalRecord._id, node.node_id, approver.name)}
                                        />
                                      </Tooltip>
                                      <Tooltip title="转审">
                                        <SwapOutlined
                                          className="text-blue-500 text-base cursor-pointer hover:text-blue-400 hover:bg-blue-50 rounded-full p-1 transition-all"
                                          onClick={() => openTransferModal(approvalRecord._id, node.node_id, approver.name, approver.avatar)}
                                        />
                                      </Tooltip>
                                    </div>
                                  )}

                                  {/* Transfer chain: from this approver to target */}
                                  {isTransferFrom && transferAnimation && (
                                    <div className="flex items-center gap-1 ml-1">
                                      <div className="flex flex-col items-center">
                                        <span className="text-[10px] text-blue-500 font-medium whitespace-nowrap">转审至</span>
                                        <svg width="50" height="12" viewBox="0 0 50 12" className="block">
                                          <line
                                            x1="0" y1="6" x2="50" y2="6"
                                            stroke="#3b82f6"
                                            strokeWidth="1.5"
                                            strokeDasharray="4 2"
                                            className="transfer-chain-draw"
                                          />
                                          <polygon points="46,2 50,6 46,10" fill="#3b82f6" className="transfer-target-appear" />
                                        </svg>
                                      </div>
                                      <div className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 pl-0.5 pr-2 py-0.5 text-xs transfer-target-appear">
                                        <Avatar size={18} src={transferAnimation.toAvatar} icon={<UserOutlined />} />
                                        <span className="font-medium">{transferAnimation.toName}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Actions for this node */}
                          {actionsForNode.length > 0 && (
                            <div className="space-y-0.5">
                              {actionsForNode.map((action, actIdx) => (
                                <div key={actIdx} className="text-xs text-[var(--text-tertiary)]">
                                  {action.approver_name} {action.action === 'approve' ? '通过' : action.action === 'reject' ? '驳回' : `转审至 ${action.transferred_to_name}`}
                                  {action.comment ? `: ${action.comment}` : ''}
                                  {action.acted_at ? ` (${new Date(action.acted_at).toLocaleString()})` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                  {detailItem?.has_approval_flow
                    ? "审批流程加载失败，请刷新重试"
                    : "该报销单未配置审批流程"}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      {/* 文件预览弹窗 */}
      <FilePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      {/* 转审选择弹窗 */}
      <Modal
        title="转审给"
        open={transferModalOpen}
        onCancel={() => {
          setTransferModalOpen(false)
          setTransferFromApprover(null)
        }}
        footer={null}
        width={480}
      >
        {transferFromApprover && (
          <div className="mb-3 text-sm text-[var(--text-secondary)]">
            将 <span className="font-medium text-[var(--text-primary)]">{transferFromApprover.name}</span> 的审批权转给:
          </div>
        )}
        {transferEmpLoading ? (
          <div className="text-center py-8"><LoadingOutlined className="text-2xl text-[var(--color-primary)]" /></div>
        ) : (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {transferEmployees.map((emp) => (
              <div
                key={emp._id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-page)] transition-colors"
                onClick={() => handleTransferSelect(emp)}
              >
                <Avatar src={emp.avatar} icon={<UserOutlined />} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{emp.name}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    {emp.dept_id?.name ?? ''}{emp.dept_id?.name && emp.position ? ' / ' : ''}{emp.position ?? ''}
                    {emp.employee_no ? ` (${emp.employee_no})` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  )
}
