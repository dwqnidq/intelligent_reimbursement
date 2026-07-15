import { useEffect, useMemo, useState } from 'react'
import { Tag, Button, Descriptions, Modal, Form, Input, Select, InputNumber, DatePicker, message, Avatar, Tooltip, Pagination, Empty, Spin, TreeSelect, Progress } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, FileTextOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, SwapOutlined, LoadingOutlined, RightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { getReimbursementTreeList, getReimbursementTypes, updateReimbursementStatus, withdrawReimbursement, exportReimbursementsExcelWithProgress } from '../api/reimbursement'
import type { ReimbursementRecord, ReimbursementListParams, ReimbursementTreeGroup, ReimbursementType } from '../api/reimbursement'
import { getApprovalRecordByReimbursement, approveRecord, rejectRecord, transferRecord } from '../api/approvalRecord'
import type { ApprovalRecordItem } from '../api/approvalRecord'
import { getEmployees } from '../api/employee'
import type { Employee } from '../api/employee'
import { getDepartments, buildDepartmentTreeOptions } from '../api/department'
import { useAuthStore } from '../store/useAuthStore'
import FilePreviewModal from '../components/FilePreviewModal'
import './ReimbursementList.css'

const statusMap: Record<string, { color: string; label: string; banner: string }> = {
  approved: { color: 'green', label: '已通过', banner: 'approved' },
  pending:  { color: 'orange', label: '审核中', banner: 'pending' },
  rejected: { color: 'red', label: '已驳回', banner: 'rejected' },
  mixed:    { color: 'blue', label: '混合状态', banner: 'mixed' },
}

function resolveBatchStatus(records: ReimbursementRecord[]): string {
  const statusSet = new Set(records.map((r) => r.status).filter(Boolean))
  if (statusSet.size === 0) return 'pending'
  if (statusSet.size === 1) return Array.from(statusSet)[0]
  return 'mixed'
}

type BatchView = {
  id: string
  applyDate: string | null
  categorySummary: string
  totalAmount: number
  count: number
  status: string
  records: ReimbursementRecord[]
}

function buildBatchViews(treeList: ReimbursementTreeGroup[]): BatchView[] {
  return treeList
    .filter((g) => (g.children?.length ?? 0) > 0)
    .map((g) => ({
      id: g._id,
      applyDate: g.apply_date,
      categorySummary: Array.from(new Set((g.children ?? []).map((x) => x.category).filter(Boolean))).join(' / '),
      totalAmount: g.total_amount ?? 0,
      count: g.count ?? g.children?.length ?? 0,
      status: g.status ?? resolveBatchStatus(g.children ?? []),
      records: g.children ?? [],
    }))
}

function buildFilterParams(values: Record<string, unknown>): ReimbursementListParams {
  const dateRange = values.dateRange as [Dayjs, Dayjs] | null | undefined
  const amountMin = values.amount_min as number | null | undefined
  const amountMax = values.amount_max as number | null | undefined
  const statusList = values.status as string[] | undefined
  const employeeIds = values.employee_ids as string[] | undefined
  const departmentIds = values.department_ids as string[] | undefined
  return {
    category: (values.category as string) || undefined,
    status: statusList?.length ? statusList.join(',') : undefined,
    employee_ids: employeeIds?.length ? employeeIds.join(',') : undefined,
    department_ids: departmentIds?.length ? departmentIds.join(',') : undefined,
    min_amount: amountMin != null ? amountMin : undefined,
    max_amount: amountMax != null ? amountMax : undefined,
    start_date: dateRange?.[0]?.format('YYYY-MM-DD') ?? undefined,
    end_date: dateRange?.[1]?.format('YYYY-MM-DD') ?? undefined,
  }
}

function ReimbursementBatchGroup({
  batch,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  batch: BatchView
  expanded: boolean
  onToggle: () => void
  selectedId?: string
  onSelect: (record: ReimbursementRecord) => void
}) {
  const batchStatus = statusMap[batch.status]
  return (
    <div className="rb-batch-group">
      <button
        type="button"
        className={`rb-batch-header rb-batch-header--${getBannerClass(batch.status)}${expanded ? ' expanded' : ''}`}
        onClick={onToggle}
      >
        <RightOutlined className="rb-batch-chevron" />
        <div className="rb-batch-header-text">
          <span className="rb-batch-title">
            {batch.applyDate ?? '-'}
            <span className="rb-batch-status-tag">{batchStatus?.label ?? batch.status}</span>
          </span>
          <span className="rb-batch-sub">
            {batch.categorySummary || '未分类'} · ¥{batch.totalAmount.toFixed(2)} · {batch.count}条
          </span>
        </div>
      </button>
      {expanded && (
        <div className="rb-batch-children">
          {batch.records.map((record) => (
            <ReimbursementRecordCard
              key={record._id}
              record={record}
              active={selectedId === record._id}
              onClick={() => onSelect(record)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
function getBannerClass(status: string): string {
  return statusMap[status]?.banner ?? 'pending'
}

function ReimbursementRecordCard({
  record,
  active,
  onClick,
}: {
  record: ReimbursementRecord
  active: boolean
  onClick: () => void
}) {
  const status = statusMap[record.status]
  const company = record.company_name?.trim() || '-'
  const applicant = record.applicant_name?.trim()
  return (
    <div className={`rb-card rb-card--${getBannerClass(record.status)}${active ? ' active' : ''}`} onClick={onClick}>
      <div className={`rb-card-banner ${getBannerClass(record.status)}`}>
        <span className="rb-card-tag">{status?.label ?? record.status}</span>
        <h3 title={record.category}>{record.category || '未分类'}</h3>
        <p>{record.apply_date ?? '未填写日期'}</p>
      </div>
      <div className="rb-card-body">
        <div className="rb-card-top-row">
          <div className="min-w-0">
            <div className="rb-card-category" title={record.category}>{record.category || '未分类'}</div>
            {applicant && <div className="rb-card-meta">{applicant}</div>}
          </div>
          <div className="rb-card-amount">¥ {(record.amount ?? 0).toFixed(2)}</div>
        </div>
        <div className="rb-card-kv">
          <span className="k">公司</span>
          <span className="v" title={company}>{company}</span>
          <span className="k">账户</span>
          <span className="v">{record.payment_account?.trim() || '-'}</span>
        </div>
        <div className="rb-card-footer">
          <span>{record.apply_date ?? '-'}</span>
          <span className="attach">
            <FileTextOutlined style={{ fontSize: 10 }} />
            {record.attachments.length ? `${record.attachments.length} 个附件` : '无附件'}
          </span>
          {record.is_over_limit && <span style={{ color: '#ea580c', fontWeight: 600 }}>超额</span>}
        </div>
      </div>
    </div>
  )
}

interface ActionProps {
  item: ReimbursementRecord
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRevoke: (id: string) => void
}

function ActionButtons({ item, onApprove, onReject, onRevoke }: ActionProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {item.status === 'pending' && !item.has_approval_flow && (
        <>
          <Button size="small" type="primary" style={{ background: '#16a34a' }} onClick={() => onApprove(item._id)}>通过</Button>
          <Button size="small" danger onClick={() => onReject(item._id)}>驳回</Button>
        </>
      )}
      {(item.status === 'approved' || item.status === 'rejected') && (
        <Button size="small" onClick={() => onRevoke(item._id)}>撤回</Button>
      )}
    </div>
  )
}

export default function ReimbursementList() {
  const [treeList, setTreeList] = useState<ReimbursementTreeGroup[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size] = useState(10)
  const [loading, setLoading] = useState(false)
  const canApprove = useAuthStore((s) => s.hasPermission('reimbursement:approve'))
  const currentUser = useAuthStore((s) => s.user)

  const [filterForm] = Form.useForm()
  const [filters, setFilters] = useState<ReimbursementListParams>({})
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([])
  const [allTypes, setAllTypes] = useState<ReimbursementType[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<{ label: string; value: string }[]>([])
  const [departmentTreeOptions, setDepartmentTreeOptions] = useState<
    { title: string; value: string; children?: { title: string; value: string }[] }[]
  >([])

  const [exportModal, setExportModal] = useState(false)
  const [exportForm] = Form.useForm()
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ percent: number; message: string } | null>(null)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectId, setRejectId] = useState('')
  const [rejectForm] = Form.useForm()
  const [rejectLoading, setRejectLoading] = useState(false)

  const [detailItem, setDetailItem] = useState<ReimbursementRecord | null>(null)
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecordItem | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)

  const [animatingApprover, setAnimatingApprover] = useState<{
    nodeId: string; approverName: string; type: 'approve' | 'reject'; phase: 'ring' | 'icon' | 'fadeout' | 'done'
  } | null>(null)

  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferFromApprover, setTransferFromApprover] = useState<{ recordId: string; nodeId: string; name: string; avatar: string } | null>(null)
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([])
  const [transferEmpLoading, setTransferEmpLoading] = useState(false)
  const [transferAnimation, setTransferAnimation] = useState<{
    nodeId: string; fromName: string; fromAvatar: string; toName: string; toAvatar: string
  } | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rejectReasonModal, setRejectReasonModal] = useState(false)
  const [viewRejectReason, setViewRejectReason] = useState('')
  const [collapsedBatchIds, setCollapsedBatchIds] = useState<Set<string>>(new Set())

  const batchViews = useMemo(() => buildBatchViews(treeList), [treeList])

  const selectRecord = (item: ReimbursementRecord) => {
    setDetailItem(item)
    setApprovalRecord(null)
    if (!item.has_approval_flow) {
      setApprovalLoading(false)
      return
    }
    setApprovalLoading(true)
    getApprovalRecordByReimbursement(item._id)
      .then((data) => setApprovalRecord(data))
      .catch(() => setApprovalRecord(null))
      .finally(() => setApprovalLoading(false))
  }

  const fetchList = (p = page, f: ReimbursementListParams = filters) => {
    setLoading(true)
    getReimbursementTreeList({ page: p, size, ...f })
      .then((res) => {
        setTreeList(res?.list ?? [])
        setTotal(res?.total ?? 0)
        setPage(p)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setCollapsedBatchIds(new Set())
  }, [treeList])

  const displayRecords = useMemo(
    () => batchViews.flatMap((b) => b.records),
    [batchViews],
  )

  const toggleBatch = (batchId: string) => {
    setCollapsedBatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  useEffect(() => {
    fetchList(1)
    getReimbursementTypes()
      .then((types) => {
        setAllTypes(types)
        setCategoryOptions(types.map((t) => ({ label: t.label, value: t.code })))
      })
      .catch(() => {})
    if (canApprove) {
      getEmployees({ page_size: 500 })
        .then((res) => {
          setEmployeeOptions(
            (res?.list ?? []).map((e) => ({ label: e.name, value: e._id })),
          )
        })
        .catch(() => {})
      getDepartments({ tree: true })
        .then((depts) => setDepartmentTreeOptions(buildDepartmentTreeOptions(depts)))
        .catch(() => {})
    }
  }, [canApprove])

  useEffect(() => {
    if (displayRecords.length === 0) {
      setDetailItem(null)
      return
    }
    const currentStillExists = detailItem && displayRecords.some((r) => r._id === detailItem._id)
    if (!currentStillExists) {
      selectRecord(displayRecords[0])
    }
  }, [displayRecords])

  const handleSearch = () => {
    const params = buildFilterParams(filterForm.getFieldsValue())
    setFilters(params)
    fetchList(1, params)
  }

  const handleReset = () => {
    filterForm.resetFields()
    const emptyFilters: ReimbursementListParams = {}
    setFilters(emptyFilters)
    fetchList(1, emptyFilters)
  }

  const handlePageChange = (p: number) => {
    fetchList(p, filters)
  }

  const handleExport = async () => {
    const values = exportForm.getFieldsValue()
    const dateRange: [Dayjs, Dayjs] | null = values.dateRange ?? null
    setExporting(true)
    setExportProgress({ percent: 0, message: '准备导出...' })
    try {
      await exportReimbursementsExcelWithProgress({
        categories: values.categories?.length ? values.categories : undefined,
        statuses: values.status?.length ? values.status : undefined,
        employee_ids: values.employee_ids?.length ? values.employee_ids : undefined,
        department_ids: values.department_ids?.length ? values.department_ids : undefined,
        min_amount: values.min_amount ?? undefined,
        max_amount: values.max_amount ?? undefined,
        start_date: dateRange?.[0]?.format('YYYY-MM-DD') ?? undefined,
        end_date: dateRange?.[1]?.format('YYYY-MM-DD') ?? undefined,
      }, (event) => {
        setExportProgress({ percent: event.percent, message: event.message })
      })
      message.success('导出成功')
      setExportModal(false)
      exportForm.resetFields()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败'
      message.warning(msg)
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  const refreshAfterAction = () => {
    fetchList(page, filters)
  }

  const handleApprove = (id: string) => {
    updateReimbursementStatus(id, { status: 'approved' })
      .then(() => refreshAfterAction())
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
          refreshAfterAction()
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
      onOk: () => withdrawReimbursement(id).then(() => refreshAfterAction()).catch(() => {}),
    })
  }

  const handleAnimatedApprove = async (recordId: string, nodeId: string, approverName: string) => {
    setAnimatingApprover({ nodeId, approverName, type: 'approve', phase: 'ring' })
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'icon' } : null)
    let success = false
    try {
      await approveRecord(recordId)
      success = true
    } catch { /* interceptor */ }
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
    refreshAfterAction()
  }

  const handleAnimatedReject = async (recordId: string, nodeId: string, approverName: string) => {
    setAnimatingApprover({ nodeId, approverName, type: 'reject', phase: 'ring' })
    await new Promise((r) => setTimeout(r, 1000))
    setAnimatingApprover((prev) => prev ? { ...prev, phase: 'icon' } : null)
    let success = false
    try {
      await rejectRecord(recordId)
      success = true
    } catch { /* interceptor */ }
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
    refreshAfterAction()
  }

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
    setTransferAnimation({
      nodeId: transferFromApprover.nodeId,
      fromName: transferFromApprover.name,
      fromAvatar: transferFromApprover.avatar,
      toName: emp.name,
      toAvatar: emp.avatar || '',
    })
    try {
      await transferRecord(transferFromApprover.recordId, emp._id)
      message.success(`已转审给 ${emp.name}`)
    } catch {
      setTransferAnimation(null)
    }
    if (detailItem) {
      getApprovalRecordByReimbursement(detailItem._id)
        .then((data) => setApprovalRecord(data))
        .catch(() => {})
    }
    refreshAfterAction()
  }

  return (
    <div className="reimbursement-page">
      <div className="reimbursement-page-header">
        <div className="flex items-center gap-2.5">
          <div className="page-title-icon">
            <FileTextOutlined className="text-sm" />
          </div>
          <h2>报销记录</h2>
        </div>
        {canApprove && (
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => setExportModal(true)}>
            导出
          </Button>
        )}
      </div>

      <div className="reimbursement-split">
        {/* 左侧：筛选 + 卡片列表 */}
        <aside className="reimbursement-sidebar">
          <div className="reimbursement-filter">
            <Form form={filterForm} layout="vertical" size="small">
              <Form.Item name="category" className="mb-2">
                <Select placeholder="费用类型" options={categoryOptions} allowClear />
              </Form.Item>
              <Form.Item name="status" className="mb-2">
                <Select placeholder="状态（可多选）" allowClear mode="multiple"
                  options={[
                    { label: '审核中', value: 'pending' },
                    { label: '已通过', value: 'approved' },
                    { label: '已驳回', value: 'rejected' },
                  ]} />
              </Form.Item>
              {canApprove && (
                <>
                  <Form.Item name="employee_ids" className="mb-2">
                    <Select
                      mode="multiple"
                      placeholder="员工（可多选）"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={employeeOptions}
                    />
                  </Form.Item>
                  <Form.Item name="department_ids" className="mb-2">
                    <TreeSelect
                      treeData={departmentTreeOptions}
                      placeholder="部门（含子部门，可多选）"
                      allowClear
                      treeCheckable
                      showCheckedStrategy={TreeSelect.SHOW_ALL}
                      treeDefaultExpandAll
                      maxTagCount="responsive"
                      className="w-full"
                    />
                  </Form.Item>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Form.Item name="amount_min" className="mb-2">
                  <InputNumber placeholder="最小金额" min={0} className="w-full" />
                </Form.Item>
                <Form.Item name="amount_max" className="mb-2">
                  <InputNumber placeholder="最大金额" min={0} className="w-full" />
                </Form.Item>
              </div>
              <Form.Item name="dateRange" className="mb-2">
                <DatePicker.RangePicker className="w-full" />
              </Form.Item>
              <div className="reimbursement-filter-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} block>查询</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              </div>
            </Form>
          </div>

          <div className="reimbursement-card-list">
            {loading ? (
              <div className="flex justify-center py-12"><Spin /></div>
            ) : batchViews.length === 0 ? (
              <Empty description="暂无报销记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              batchViews.map((batch) => (
                <ReimbursementBatchGroup
                  key={batch.id}
                  batch={batch}
                  expanded={!collapsedBatchIds.has(batch.id)}
                  onToggle={() => toggleBatch(batch.id)}
                  selectedId={detailItem?._id}
                  onSelect={selectRecord}
                />
              ))
            )}
          </div>

          {total > size && (
            <div className="reimbursement-pagination">
              <Pagination
                current={page}
                pageSize={size}
                total={total}
                onChange={handlePageChange}
                size="small"
                showTotal={(t) => `共 ${t} 批`}
              />
            </div>
          )}
          {total > 0 && total <= size && (
            <div className="reimbursement-pagination text-xs text-[var(--text-tertiary)]">
              共 {total} 批
            </div>
          )}
        </aside>

        {/* 右侧：详情面板 */}
        <main className="reimbursement-detail">
          {!detailItem ? (
            <div className="reimbursement-detail-empty">
              <div className="reimbursement-detail-empty-icon">
                <FileTextOutlined />
              </div>
              <p>选择左侧卡片查看报销详情</p>
            </div>
          ) : (
            <>
              <div className={`reimbursement-detail-header rb-card-banner ${getBannerClass(detailItem.status)}`}>
                <span className="rb-card-tag">{statusMap[detailItem.status]?.label ?? detailItem.status}</span>
                <h3 title={detailItem.category}>{detailItem.category || '未分类'}</h3>
                <p>{detailItem.apply_date ?? '未填写日期'}</p>
              </div>

              <div className="reimbursement-detail-body">
                {canApprove && (
                  <div className="reimbursement-detail-actions">
                    <ActionButtons
                      item={detailItem}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onRevoke={handleRevoke}
                    />
                  </div>
                )}
                <div className="reimbursement-detail-grid">
                  {/* 报销信息 */}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">报销信息</p>
                    <Descriptions column={1} size="small" bordered styles={{ label: { width: 90 } }}>
                      <Descriptions.Item label="费用类型">{detailItem.category}</Descriptions.Item>
                      {detailItem.applicant_name && (
                        <Descriptions.Item label="申请人">{detailItem.applicant_name}</Descriptions.Item>
                      )}
                      <Descriptions.Item label="申请日期">{detailItem.apply_date ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="所属公司">{detailItem.company_name?.trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="收款账户">{detailItem.payment_account?.trim() || '-'}</Descriptions.Item>
                      <Descriptions.Item label="金额">
                        <span className="text-red-500 font-medium">¥ {(detailItem.amount ?? 0).toFixed(2)}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="超额情况">
                        {detailItem.is_over_limit ? <Tag color="orange">超额</Tag> : <Tag>正常</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <Tag color={statusMap[detailItem.status]?.color}>{statusMap[detailItem.status]?.label}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="驳回原因">
                        {detailItem.reject_reason ? (
                          detailItem.reject_reason.length <= 40 ? detailItem.reject_reason : (
                            <span
                              className="text-[var(--color-primary)] cursor-pointer"
                              onClick={() => { setViewRejectReason(detailItem.reject_reason!); setRejectReasonModal(true) }}
                            >
                              {detailItem.reject_reason.slice(0, 40)}...
                            </span>
                          )
                        ) : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="审批人">{detailItem.approver ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="审批时间">{detailItem.approved_at ?? '-'}</Descriptions.Item>
                      <Descriptions.Item label="附件">
                        {detailItem.attachments.length
                          ? detailItem.attachments.map((url, i) => (
                              <Button key={i} type="link" size="small" className="p-0 block text-left" onClick={() => setPreviewUrl(url)}>
                                附件{i + 1}
                              </Button>
                            ))
                          : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>

                  {/* 报销明细 */}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">报销明细</p>
                    {detailItem.detail && detailItem.detail.length > 0 ? (
                      <Descriptions column={1} size="small" bordered styles={{ label: { width: 90 } }}>
                        {detailItem.detail.map((d, i) => (
                          <Descriptions.Item key={i} label={d.label}>{d.value ?? '-'}</Descriptions.Item>
                        ))}
                      </Descriptions>
                    ) : (
                      <div className="text-sm text-[var(--text-tertiary)] py-4 text-center border border-dashed border-[var(--border-color)] rounded-lg">暂无明细</div>
                    )}
                  </div>

                  {/* 审批流程 */}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">审批流程</p>
                    {approvalLoading ? (
                      <div className="text-center text-[var(--text-tertiary)] text-sm py-4"><Spin size="small" /> 加载中...</div>
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
                              <div className="flex flex-col items-center">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 flex-shrink-0"
                                  style={{
                                    borderColor: isRejected ? '#ef4444' : isPast ? '#22c55e' : isCurrent ? '#3b82f6' : 'var(--border-color)',
                                    background: isRejected ? '#fef2f2' : isPast ? '#f0fdf4' : isCurrent ? '#eff6ff' : 'transparent',
                                  }}
                                >
                                  {statusIcon}
                                </div>
                                {idx < approvalRecord.flow_snapshot.nodes.length - 1 && (
                                  <div className={`w-0.5 h-6 ${isPast ? 'bg-green-500' : 'bg-transparent'}`} />
                                )}
                              </div>
                              <div className="flex-1 pb-4 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium">节点 {idx + 1}</span>
                                  <Tag color={node.sign_type === 'countersign' ? 'blue' : 'cyan'} className="text-xs">
                                    {node.sign_type === 'countersign' ? '会签' : '或签'}
                                  </Tag>
                                  {isRejected && <Tag color="red" className="text-xs">已驳回</Tag>}
                                  {isCurrent && <Tag color="processing" className="text-xs">审批中</Tag>}
                                </div>
                                <div className="flex flex-wrap items-start gap-3 mb-1">
                                  {node.approvers.map((approver, aIdx) => {
                                    const hasApproved = node.approved_by?.includes(approver.name)
                                      || approver.participation === 'approved'
                                    const hasRejected = actionsForNode.some((a) => a.approver_name === approver.name && a.action === 'reject')
                                      || approver.participation === 'rejected'
                                    const hasTransferred = actionsForNode.some(
                                      (a) => a.approver_name === approver.name && a.action === 'transfer',
                                    )
                                    const isSkipped = approver.participation === 'skipped'
                                    const isMe = approver.name === currentUser?.real_name
                                    const isAnimating = animatingApprover?.nodeId === node.node_id && animatingApprover?.approverName === approver.name
                                    const pillBg = isAnimating && (animatingApprover?.phase === 'icon' || animatingApprover?.phase === 'fadeout')
                                      ? (animatingApprover.type === 'approve' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-red-50 border-red-200 text-red-600')
                                      : hasRejected ? 'bg-red-50 border-red-200 text-red-600'
                                      : hasApproved ? 'bg-green-50 border-green-200 text-green-600'
                                      : isSkipped ? 'bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-tertiary)] opacity-60'
                                      : 'bg-[var(--bg-page)] border-[var(--border-color)] text-[var(--text-secondary)]'
                                    const isTransferFrom = transferAnimation?.fromName === approver.name

                                    return (
                                      <div key={aIdx} className="flex items-center gap-1.5 flex-wrap">
                                        <Tooltip title={`${approver.dept_name ?? ''}${approver.dept_name && approver.position ? ' / ' : ''}${approver.position ?? ''}`}>
                                          <div className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs border transition-colors duration-300 ${pillBg}`}>
                                            <div className="relative flex-shrink-0" style={{ width: 22, height: 22 }}>
                                              <Avatar size={18} src={approver.avatar} icon={<UserOutlined />} style={{ position: 'absolute', top: 2, left: 2 }} />
                                              {isAnimating && animatingApprover?.phase === 'ring' && (
                                                <svg className="absolute top-0 left-0" width="22" height="22" viewBox="0 0 22 22" style={{ pointerEvents: 'none' }}>
                                                  <circle cx="11" cy="11" r="9" fill="none"
                                                    stroke={animatingApprover.type === 'approve' ? '#22c55e' : '#ef4444'}
                                                    strokeWidth="2" strokeDasharray="56.5" strokeDashoffset="56.5" strokeLinecap="round"
                                                    className="approval-progress-ring" />
                                                </svg>
                                              )}
                                              {isAnimating && (animatingApprover?.phase === 'icon' || animatingApprover?.phase === 'fadeout') && (
                                                <div className={`absolute -top-1 -right-1 z-10 ${animatingApprover.phase === 'fadeout' ? 'approval-icon-fadeout' : 'approval-icon-appear'}`}>
                                                  {animatingApprover.type === 'approve'
                                                    ? <CheckCircleOutlined className="text-green-500 text-xs" />
                                                    : <CloseCircleOutlined className="text-red-500 text-xs" />}
                                                </div>
                                              )}
                                            </div>
                                            <span className="font-medium">{approver.name}</span>
                                            {hasApproved && !isAnimating && <CheckCircleOutlined className="text-green-500 text-[10px]" />}
                                            {hasRejected && !isAnimating && <CloseCircleOutlined className="text-red-500 text-[10px]" />}
                                            {isSkipped && !isAnimating && (
                                              <span className="text-[10px]">已跳过</span>
                                            )}
                                          </div>
                                        </Tooltip>
                                        {isCurrent &&
                                          approvalRecord?.status === 'pending' &&
                                          isMe &&
                                          !hasApproved &&
                                          !hasRejected &&
                                          !hasTransferred &&
                                          !isSkipped &&
                                          !isAnimating && (
                                          <div className="flex items-center gap-1.5">
                                            <Tooltip title="通过">
                                              <CheckCircleOutlined className="text-green-500 text-base cursor-pointer hover:text-green-400 hover:bg-green-50 rounded-full p-1 transition-all"
                                                onClick={() => handleAnimatedApprove(approvalRecord._id, node.node_id, approver.name)} />
                                            </Tooltip>
                                            <Tooltip title="驳回">
                                              <CloseCircleOutlined className="text-red-500 text-base cursor-pointer hover:text-red-400 hover:bg-red-50 rounded-full p-1 transition-all"
                                                onClick={() => handleAnimatedReject(approvalRecord._id, node.node_id, approver.name)} />
                                            </Tooltip>
                                            <Tooltip title="转审">
                                              <SwapOutlined className="text-blue-500 text-base cursor-pointer hover:text-blue-400 hover:bg-blue-50 rounded-full p-1 transition-all"
                                                onClick={() => openTransferModal(approvalRecord._id, node.node_id, approver.name, approver.avatar)} />
                                            </Tooltip>
                                          </div>
                                        )}
                                        {isTransferFrom && transferAnimation && (
                                          <div className="flex items-center gap-1 ml-1">
                                            <div className="flex flex-col items-center">
                                              <span className="text-[10px] text-blue-500 font-medium whitespace-nowrap">转审至</span>
                                              <svg width="50" height="12" viewBox="0 0 50 12" className="block">
                                                <line x1="0" y1="6" x2="50" y2="6" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 2" className="transfer-chain-draw" />
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
                      <div className="text-sm text-[var(--text-tertiary)] py-4 text-center border border-dashed border-[var(--border-color)] rounded-lg">
                        {detailItem?.has_approval_flow ? '审批流程加载失败，请刷新重试' : '该报销单未配置审批流程'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* 导出弹窗 */}
      <Modal title="导出报销记录" open={exportModal}
        onCancel={() => { if (!exporting) { setExportModal(false); exportForm.resetFields(); setExportProgress(null) } }}
        onOk={handleExport} okText="确认导出" cancelText="取消"
        okButtonProps={{ loading: exporting }} cancelButtonProps={{ disabled: exporting }}
        closable={!exporting} maskClosable={!exporting} width={520}>
        <Form form={exportForm} layout="vertical" className="mt-4">
          <Form.Item name="categories" label="报销类型（不选则导出全部）">
            <Select mode="multiple" placeholder="可多选，不选则导出全部类型"
              options={allTypes.map((t) => ({ label: t.label, value: t._id }))} allowClear className="w-full" />
          </Form.Item>
          <Form.Item name="status" label="状态（不选则导出全部状态）">
            <Select mode="multiple" placeholder="可多选" allowClear className="w-full"
              options={[
                { label: '审核中', value: 'pending' },
                { label: '已通过', value: 'approved' },
                { label: '已驳回', value: 'rejected' },
              ]} />
          </Form.Item>
          <Form.Item name="employee_ids" label="员工（不选则全部）">
            <Select
              mode="multiple"
              placeholder="按员工姓名筛选"
              allowClear
              showSearch
              optionFilterProp="label"
              options={employeeOptions}
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="department_ids" label="部门（含子部门，不选则全部）">
            <TreeSelect
              treeData={departmentTreeOptions}
              placeholder="每一级部门均可选择"
              allowClear
              treeCheckable
              showCheckedStrategy={TreeSelect.SHOW_ALL}
              treeDefaultExpandAll
              maxTagCount="responsive"
              className="w-full"
            />
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
        {exportProgress && (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
            <Progress percent={exportProgress.percent} status="active" strokeColor="#1677ff" />
            <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">{exportProgress.message}</p>
          </div>
        )}
      </Modal>

      <Modal title="填写驳回原因" open={rejectModal} onOk={handleRejectConfirm}
        onCancel={() => { setRejectModal(false); rejectForm.resetFields() }}
        okText="确定驳回" cancelText="取消" okButtonProps={{ danger: true, loading: rejectLoading }}>
        <Form form={rejectForm} layout="vertical" className="mt-4">
          <Form.Item name="rejectReason" label="驳回原因" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <Input.TextArea rows={3} placeholder="请输入驳回原因，如：缺少发票" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="驳回原因" open={rejectReasonModal} onCancel={() => setRejectReasonModal(false)}
        footer={<Button onClick={() => setRejectReasonModal(false)}>关闭</Button>} width={480}>
        <div className="py-4 px-2">
          <p className="text-[var(--text-primary)] whitespace-pre-wrap wrap-break-word">{viewRejectReason}</p>
        </div>
      </Modal>

      <FilePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />

      <Modal title="转审给" open={transferModalOpen}
        onCancel={() => { setTransferModalOpen(false); setTransferFromApprover(null) }}
        footer={null} width={480}>
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
              <div key={emp._id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-page)] transition-colors"
                onClick={() => handleTransferSelect(emp)}>
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
    </div>
  )
}
