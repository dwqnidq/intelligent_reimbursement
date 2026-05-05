import { useEffect, useState } from 'react'
import { Card, Col, Row, Table, Tag, DatePicker, Button } from 'antd'
import {
  MoneyCollectOutlined, FileTextOutlined, WarningOutlined,
  ClockCircleOutlined, ArrowRightOutlined, RightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getReimbursementList } from '../api/reimbursement'
import type { ReimbursementRecord } from '../api/reimbursement'
import { useAuthStore } from '../store/useAuthStore'
import type { MenuItem } from '../api/user'

const statusMap: Record<string, { color: string; label: string }> = {
  approved: { color: 'green', label: '已通过' },
  pending:  { color: 'orange', label: '审核中' },
  rejected: { color: 'red', label: '已驳回' },
}

function getTotalPrice(r: ReimbursementRecord): number {
  const item = r.detail?.find(d => d.label === '总价')
  return item ? parseFloat(item.value) || 0 : 0
}

const statStyles = [
  { borderColor: '#2563eb', iconBg: '#eff6ff', iconColor: '#2563eb' },
  { borderColor: '#22c55e', iconBg: '#ecfdf5', iconColor: '#22c55e' },
  { borderColor: '#f59e0b', iconBg: '#fffbeb', iconColor: '#f59e0b' },
  { borderColor: '#ef4444', iconBg: '#fef2f2', iconColor: '#ef4444' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const user = useAuthStore(s => s.user)
  const menus = useAuthStore(s => s.menus)
  const isAdmin = hasPermission('reimbursement:approve')

  const flatMenus = (items: MenuItem[]): MenuItem[] =>
    items.flatMap((m) => [m, ...flatMenus(m.children ?? [])])
  const allMenus = flatMenus(menus)
  const findPathByComponent = (component: string, fallback: string): string =>
    allMenus.find((m) => m.component === component)?.path ?? fallback
  const reimbursementListPath = findPathByComponent('ReimbursementList', '/')
  const reimbursementTypeCreatePath = findPathByComponent('ReimbursementTypeCreate', '/')

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
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined />, onClick: () => navigate(reimbursementListPath) },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined />, onClick: () => navigate(reimbursementListPath) },
        { title: '超额报销笔数', value: overLimitCount, icon: <WarningOutlined />, onClick: () => navigate('/reimbursement/anomaly') },
        { title: '待审核笔数', value: pendingCount, icon: <ClockCircleOutlined />, onClick: () => navigate(reimbursementListPath) },
      ]
    : [
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined />, onClick: undefined },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined />, onClick: undefined },
        { title: '审核中笔数', value: pendingCount, icon: <ClockCircleOutlined />, onClick: undefined },
        { title: '超额笔数', value: overLimitCount, icon: <WarningOutlined />, onClick: undefined },
      ]

  const quickActions = [
    { label: '报销记录', path: reimbursementListPath, icon: <FileTextOutlined /> },
    { label: '异常记录', path: '/reimbursement/anomaly', icon: <WarningOutlined /> },
    { label: '新增报销类型', path: reimbursementTypeCreatePath, icon: <MoneyCollectOutlined /> },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* 欢迎横幅 */}
      <div
        className="rounded-2xl px-6 py-5 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          boxShadow: "0 4px 20px rgba(37, 99, 235, 0.25)",
        }}
      >
        <div>
          <h2 className="text-white text-lg font-bold">
            {isAdmin ? '管理员工作台' : `欢迎回来，${user?.real_name ?? user?.username}`}
          </h2>
          <p className="text-white/70 text-sm mt-1">
            {dayjs().format('YYYY年MM月DD日')} · {isAdmin ? '查看本月报销概况' : '查看您的报销记录'}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Button
            ghost
            className="!text-white !border-white/30 hover:!bg-white/15"
            icon={<RightOutlined />}
            onClick={() => navigate(reimbursementListPath)}
          >
            报销记录
          </Button>
        </div>
      </div>

      {/* 月份筛选 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-[var(--text-secondary)] font-medium">统计月份：</span>
        <DatePicker
          picker="month"
          value={dayjs(month)}
          onChange={v => v && setMonth(v.format('YYYY-MM'))}
          allowClear={false}
        />
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {statCards.map((card, i) => {
          const style = statStyles[i]
          return (
            <Col key={i} xs={12} sm={12} md={6}>
              <Card
                className="cursor-pointer"
                onClick={card.onClick}
                styles={{ body: { padding: '18px 20px' } }}
                style={{ borderLeft: `4px solid ${style.borderColor}` }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)] mb-2 font-medium">{card.title}</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
                  </div>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: style.iconBg, color: style.iconColor }}
                  >
                    {card.icon}
                  </div>
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>

      {/* 管理员快捷入口 */}
      {isAdmin && (
        <Card>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4">快捷入口</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickActions.map(item => (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border-color)] cursor-pointer hover:border-[var(--color-primary-border)] hover:bg-[var(--color-primary-bg)] transition-all group"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)] text-[var(--color-primary)] group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
                <ArrowRightOutlined className="ml-auto text-[var(--text-tertiary)] text-xs group-hover:text-[var(--color-primary)] transition-colors" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 待处理列表 */}
      {isAdmin && pendingList.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              待审核报销
              <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">{pendingCount} 条</span>
            </p>
            <Button type="link" size="small" onClick={() => navigate(reimbursementListPath)}>
              查看全部
            </Button>
          </div>
          <Table
            dataSource={pendingList}
            rowKey="_id"
            loading={loading}
            pagination={false}
            size="small"
            columns={[
              { title: '费用类型', dataIndex: 'category' },
              { title: '申请日期', dataIndex: 'apply_date', render: (v: string | null) => v ?? '-' },
              { title: '总价', render: (_: unknown, r: ReimbursementRecord) => <span className="font-semibold">¥ {getTotalPrice(r).toFixed(2)}</span> },
              { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
            ]}
          />
        </Card>
      )}

      {/* 员工端：我的报销列表 */}
      {!isAdmin && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">本月报销记录</p>
            <Button type="link" size="small" onClick={() => navigate(reimbursementListPath)}>
              查看全部
            </Button>
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
              { title: '总价', render: (_: unknown, r: ReimbursementRecord) => <span className="font-semibold">¥ {getTotalPrice(r).toFixed(2)}</span> },
              { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.label}</Tag> },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
