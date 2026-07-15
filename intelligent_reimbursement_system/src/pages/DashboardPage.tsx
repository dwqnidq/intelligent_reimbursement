import { useEffect, useState, useMemo } from 'react'
import { Card, Col, Row, DatePicker, Button } from 'antd'
import {
  MoneyCollectOutlined, FileTextOutlined, WarningOutlined,
  CloseCircleOutlined, RightOutlined, ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getReimbursementList } from '../api/reimbursement'
import type { ReimbursementRecord } from '../api/reimbursement'
import { useAuthStore } from '../store/useAuthStore'
import type { MenuItem } from '../api/user'
import { getRecordAmount } from '../utils/reimbursementAmount'
import DashboardCharts from '../components/DashboardCharts'

const statStyles = [
  { borderColor: '#0f766e', iconBg: '#ccfbf1', iconColor: '#0f766e' },
  { borderColor: '#22c55e', iconBg: '#ecfdf5', iconColor: '#22c55e' },
  { borderColor: '#f59e0b', iconBg: '#fffbeb', iconColor: '#f59e0b' },
  { borderColor: '#ef4444', iconBg: '#fef2f2', iconColor: '#ef4444' },
]

function calcMomRate(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function MomHint({ current, previous }: { current: number; previous: number }) {
  const rate = calcMomRate(current, previous)
  if (rate == null) return null
  const up = rate >= 0
  return (
    <p className={`text-xs mt-1 mb-0 flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      较上月 {up ? '+' : ''}{rate}%
    </p>
  )
}

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

  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [list, setList] = useState<ReimbursementRecord[]>([])
  const [prevList, setPrevList] = useState<ReimbursementRecord[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = (m: string) => {
    setLoading(true)
    const cur = dayjs(m)
    const prev = cur.subtract(1, 'month')
    Promise.all([
      getReimbursementList({
        page: 1, size: 9999,
        start_date: cur.startOf('month').format('YYYY-MM-DD'),
        end_date: cur.endOf('month').format('YYYY-MM-DD'),
      }),
      getReimbursementList({
        page: 1, size: 9999,
        start_date: prev.startOf('month').format('YYYY-MM-DD'),
        end_date: prev.endOf('month').format('YYYY-MM-DD'),
      }),
    ])
      .then(([curRes, prevRes]) => {
        setList(curRes?.list ?? [])
        setPrevList(prevRes?.list ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(month) }, [month])

  const { totalAmount, totalCount, overLimitCount, rejectedCount } = useMemo(() => ({
    totalAmount: list.reduce((s, r) => s + getRecordAmount(r), 0),
    totalCount: list.length,
    overLimitCount: list.filter(r => r.is_over_limit === true).length,
    rejectedCount: list.filter(r => r.status === 'rejected').length,
  }), [list])

  const prevSummary = useMemo(() => ({
    amount: prevList.reduce((s, r) => s + getRecordAmount(r), 0),
    count: prevList.length,
    rejected: prevList.filter(r => r.status === 'rejected').length,
    overLimit: prevList.filter(r => r.is_over_limit === true).length,
  }), [prevList])

  const statCards = isAdmin
    ? [
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined />, onClick: () => navigate(reimbursementListPath), mom: { current: totalAmount, previous: prevSummary.amount } },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined />, onClick: () => navigate(reimbursementListPath), mom: { current: totalCount, previous: prevSummary.count } },
        { title: '超额报销笔数', value: overLimitCount, icon: <WarningOutlined />, onClick: () => navigate('/reimbursement/anomaly'), mom: { current: overLimitCount, previous: prevSummary.overLimit } },
        { title: '驳回笔数', value: rejectedCount, icon: <CloseCircleOutlined />, onClick: () => navigate(reimbursementListPath), mom: { current: rejectedCount, previous: prevSummary.rejected } },
      ]
    : [
        { title: '本月报销总金额', value: `¥ ${totalAmount.toFixed(2)}`, icon: <MoneyCollectOutlined />, onClick: undefined, mom: { current: totalAmount, previous: prevSummary.amount } },
        { title: '本月报销总笔数', value: totalCount, icon: <FileTextOutlined />, onClick: undefined, mom: { current: totalCount, previous: prevSummary.count } },
        { title: '驳回笔数', value: rejectedCount, icon: <CloseCircleOutlined />, onClick: undefined, mom: { current: rejectedCount, previous: prevSummary.rejected } },
        { title: '超额笔数', value: overLimitCount, icon: <WarningOutlined />, onClick: undefined, mom: { current: overLimitCount, previous: prevSummary.overLimit } },
      ]

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl px-6 py-5 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)",
          boxShadow: "0 4px 20px rgba(15, 118, 110, 0.25)",
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

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-[var(--text-secondary)] font-medium">统计月份：</span>
        <DatePicker
          picker="month"
          value={dayjs(month)}
          onChange={v => v && setMonth(v.format('YYYY-MM'))}
          allowClear={false}
        />
      </div>

      <Row gutter={[16, 16]}>
        {statCards.map((card, i) => {
          const style = statStyles[i]
          return (
            <Col key={i} xs={12} sm={12} md={6}>
              <Card
                className={card.onClick ? 'cursor-pointer' : undefined}
                onClick={card.onClick}
                styles={{ body: { padding: '18px 20px' } }}
                style={{ borderLeft: `4px solid ${style.borderColor}` }}
                loading={loading && i === 0}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)] mb-2 font-medium">{card.title}</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
                    <MomHint current={card.mom.current} previous={card.mom.previous} />
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

      <DashboardCharts list={list} prevList={prevList} isAdmin={isAdmin} />
    </div>
  )
}
