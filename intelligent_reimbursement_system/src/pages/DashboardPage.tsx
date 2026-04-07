import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Table, Tag, Select, DatePicker, Button } from 'antd'
import {
  MoneyCollectOutlined, FileTextOutlined, WarningOutlined,
  FileExclamationOutlined, ShoppingOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getReimbursementList } from '../api/reimbursement'
import type { ReimbursementRecord } from '../api/reimbursement'
import { useAuthStore } from '../store/useAuthStore'

const statusMap: Record<string, { color: string; label: string }> = {
  approved: { color: 'green', label: '已通过' },
  pending:  { color: 'orange', label: '审核中' },
  rejected: { color: 'red', label: '已驳回' },
}

function getTotalPrice(r: ReimbursementRecord): number {
  const item = r.detail?.find(d => d.label === '总价')
  return item ? parseFloat(item.value) || 0 : 0
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const isAdmin = hasPermission('reimbursement:approve')

  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [list, setList] = useState<ReimbursementRecord[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = (m: string) => {
    setLoading(true)
    const [year, mon] = m.split('-')
    getReimbursementList({
      page: 1, size: 9999,
      start_date: `${year}-${mon}-01`,
      end_date: dayjs(m).endOf('month').format('YYYY-MM-DD'),
    })
      .then(res => setList(res?.list ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(month) }, [month])

  // 统计指标
  const totalAmount = list.reduce((s, r) => s + getTotalPrice(r), 0)
  const totalCount = list.length
  const overLimitCount = list.filter(r => r.is_over_limit === true).length
  const pendingCount = list.filter(r => r.status === 'pending').length

  // 待处理列表（审核中）
  const pendingList = list.filter(r => r.status === 'pending').slice(0, 10)

  const statCards = isAdmin
    ? [
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined className="text-blue-500 text-2xl" />, color: 'bg-blue-50', onClick: () => navigate('/reimbursement/list') },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined className="text-green-500 text-2xl" />, color: 'bg-green-50', onClick: () => navigate('/reimbursement/list') },
        { title: '超额报销笔数', value: overLimitCount, icon: <WarningOutlined className="text-orange-500 text-2xl" />, color: 'bg-orange-50', onClick: () => navigate('/reimbursement/anomaly') },
        { title: '待审核笔数', value: pendingCount, icon: <ClockCircleOutlined className="text-red-500 text-2xl" />, color: 'bg-red-50', onClick: () => navigate('/reimbursement/list') },
      ]
    : [
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined className="text-blue-500 text-2xl" />, color: 'bg-blue-50', onClick: undefined },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined className="text-green-500 text-2xl" />, color: 'bg-green-50', onClick: undefined },
        { title: '审核中笔数', value: pendingCount, icon: <ClockCircleOutlined className="text-orange-500 text-2xl" />, color: 'bg-orange-50', onClick: undefined },
        { title: '超额笔数', value: overLimitCount, icon: <WarningOutlined className="text-red-500 text-2xl" />, color: 'bg-red-50', onClick: undefined },
      ]

  return (
    <div className="flex flex-col gap-4">
      {/* 月份筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-500">统计月份：</span>
        <DatePicker
          picker="month"
          value={dayjs(month)}
          onChange={v => v && setMonth(v.format('YYYY-MM'))}
          allowClear={false}
        />
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {statCards.map((card, i) => (
          <Col key={i} xs={12} sm={12} md={6}>
            <Card
              className={`rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow ${card.color}`}
              onClick={card.onClick}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{card.title}</p>
                  <p className="text-xl font-bold text-gray-800">{card.value}</p>
                </div>
                {card.icon}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 管理员快捷入口 */}
      {isAdmin && (
        <Card className="rounded-2xl shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">快捷入口</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '报销记录', path: '/reimbursement/list' },
              { label: '异常记录', path: '/reimbursement/anomaly' },
              { label: '新增报销类型', path: '/reimbursement-type/create' },
            ].map(item => (
              <Button key={item.path} onClick={() => navigate(item.path)}>{item.label}</Button>
            ))}
          </div>
        </Card>
      )}

      {/* 待处理列表 */}
      {isAdmin && pendingList.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">待审核报销（{pendingCount} 条）</p>
          <Table
            dataSource={pendingList}
            rowKey="_id"
            loading={loading}
            pagination={false}
            size="small"
            columns={[
              { title: '费用类型', dataIndex: 'category' },
              { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
              { title: '总价', render: (_: unknown, r: ReimbursementRecord) => `¥ ${getTotalPrice(r).toFixed(2)}` },
              { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
            ]}
          />
        </Card>
      )}

      {/* 员工端：我的报销列表 */}
      {!isAdmin && (
        <Card className="rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">本月报销记录</p>
            <Button type="link" size="small" onClick={() => navigate('/reimbursement/list')}>查看全部</Button>
          </div>
          <Table
            dataSource={list.slice(0, 5)}
            rowKey="_id"
            loading={loading}
            pagination={false}
            size="small"
            columns={[
              { title: '费用类型', dataIndex: 'category' },
              { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
              { title: '总价', render: (_: unknown, r: ReimbursementRecord) => `¥ ${getTotalPrice(r).toFixed(2)}` },
              { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
