import { useEffect, useState } from 'react'
import { Table, Tag, Card, Button, Descriptions, Modal, Form, Input, Select, InputNumber, DatePicker, message } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { getReimbursementList, getReimbursementTypes, searchReimbursement, updateReimbursementStatus, withdrawReimbursement, exportReimbursementsExcel } from '../api/reimbursement'
import type { ReimbursementRecord, ReimbursementListParams, ReimbursementType } from '../api/reimbursement'
import { useAuthStore } from '../store/useAuthStore'
import FilePreviewModal from '../components/FilePreviewModal'

const statusMap: Record<string, { color: string; label: string }> = {
  approved: { color: 'green', label: '已通过' },
  pending:  { color: 'orange', label: '审核中' },
  rejected: { color: 'red', label: '已驳回' },
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
      {item.status === 'pending' && (
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
  
  return (
    <>
      <Card
        size="small"
        className="mb-3 rounded-xl shadow-sm"
        extra={<Tag color={status?.color}>{status?.label}</Tag>}
        title={<span className="font-medium">{item.category}</span>}
      >
        <Descriptions column={2} size="small" labelStyle={{ color: '#888', fontSize: 12 }} contentStyle={{ fontSize: 12 }}>
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
                  className="text-blue-500 cursor-pointer"
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
          <p className="text-gray-700 whitespace-pre-wrap break-words">{item.reject_reason}</p>
        </div>
      </Modal>
    </>
  )
}

export default function ReimbursementList() {
  const [list, setList] = useState<ReimbursementRecord[]>([])
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

  // 文件预览
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 驳回原因查看弹窗
  const [rejectReasonModal, setRejectReasonModal] = useState(false)
  const [viewRejectReason, setViewRejectReason] = useState('')

  // 基础列定义（需要访问组件状态）
  const baseColumns = [
    ...(canApprove ? [{ title: '申请人', dataIndex: 'applicant_name', render: (v: string) => v ?? '-' }] : []),
    { title: '费用类型', dataIndex: 'category' },
    { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
    {
      title: '金额',
      dataIndex: 'amount',
      render: (v: number) => `¥ ${(v ?? 0).toFixed(2)}`,
    },
    {
      title: '超额',
      dataIndex: 'is_over_limit',
      render: (v: boolean) =>
        v ? <Tag color="orange">超额</Tag> : <Tag color="default">正常</Tag>,
    },
    {
      title: '附件',
      dataIndex: 'attachments',
      render: (v: string[]) =>
        v.length ? (
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
        ) : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag>,
    },
    { 
      title: '驳回原因', 
      dataIndex: 'reject_reason', 
      render: (v: string | null) => {
        if (!v) return '-'
        if (v.length <= 20) return v
        return (
          <span 
            className="text-blue-500 cursor-pointer hover:underline"
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
  ]

  const fetchList = (p = page, f = filters) => {
    setLoading(true)
    getReimbursementList({ page: p, size, ...f })
      .then((res) => { setList(res?.list ?? []); setTotal(res?.total ?? 0) })
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

        setList(resultList)
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

  const columns = canApprove
    ? [...baseColumns, {
        title: '操作',
        render: (_: unknown, record: ReimbursementRecord) => (
          <ActionButtons item={record} onApprove={handleApprove} onReject={handleReject} onRevoke={handleRevoke} onDetail={setDetailItem} />
        ),
      }]
    : [...baseColumns, {
        title: '操作',
        render: (_: unknown, record: ReimbursementRecord) => (
          <Button type="link" size="small" className="p-0" onClick={() => setDetailItem(record)}>详情</Button>
        ),
      }]

  return (
    <Card className="rounded-2xl shadow-sm w-full flex flex-col flex-1">
      {/* 标题 + 操作按钮 */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-base md:text-lg font-semibold text-gray-800">报销记录</h2>
        {canApprove && (
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => setExportModal(true)}>
            导出
          </Button>
        )}
      </div>

      {/* 筛选栏 */}
      <Form form={filterForm} layout="inline" className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 w-full">
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

      {/* 桌面端：表格 */}
      <div className="hidden md:block">
        <Table
          dataSource={list}
          rowKey="_id"
          columns={columns}
          loading={loading}
          pagination={{ current: page, pageSize: size, total, onChange: handlePageChange, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
        />
      </div>

      {/* 移动端：卡片列表 */}
      <div className="block md:hidden">
        {list.map((item) => (
          <MobileCard key={item._id} item={item} canApprove={canApprove}
            onApprove={handleApprove} onReject={handleReject} onRevoke={handleRevoke} onDetail={setDetailItem}
            onPreview={setPreviewUrl} />
        ))}
        <div className="text-center text-xs text-gray-400 mt-2">共 {total} 条</div>
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
          <p className="text-gray-700 whitespace-pre-wrap break-words">{viewRejectReason}</p>
        </div>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="报销详情"
        open={!!detailItem}
        onCancel={() => setDetailItem(null)}
        footer={<Button onClick={() => setDetailItem(null)}>关闭</Button>}
        width={520}
      >
        {detailItem && (
          <>
            <Descriptions column={1} size="small" bordered labelStyle={{ width: 100 }} className="mb-4">
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
              {(() => {
                return (
                  <Descriptions.Item label="超额情况">
                    {detailItem.is_over_limit
                      ? <Tag color="orange">超额</Tag>
                      : <Tag color="default">正常</Tag>
                    }
                  </Descriptions.Item>
                )
              })()}
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

            {detailItem.detail && detailItem.detail.length > 0 && (
              <>
                <p className="text-sm font-medium text-gray-600 mb-2">报销明细</p>
                <Descriptions column={1} size="small" bordered labelStyle={{ width: 100 }}>
                  {detailItem.detail.map((item, i) => (
                    <Descriptions.Item key={i} label={item.label}>
                      {item.value ?? '-'}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}
          </>
        )}
      </Modal>
      {/* 文件预览弹窗 */}
      <FilePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </Card>
  )
}
