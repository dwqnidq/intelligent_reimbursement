import { useMemo, type ReactNode } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import type { ReimbursementRecord } from "../api/reimbursement";
import { getRecordAmount } from "../utils/reimbursementAmount";
import "./DashboardCharts.css";

const BLUE_PALETTE = [
  "#1d4ed8",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#2563eb",
  "#1e40af",
  "#1e3a8a",
  "#bfdbfe",
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已驳回",
};

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: { fullName?: string } }[];
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const displayLabel = item.payload?.fullName ?? label ?? item.name ?? "";
  const value = item.value ?? 0;
  return (
    <div className="dashboard-chart-tooltip">
      <div className="dashboard-chart-tooltip-title">{displayLabel}</div>
      <div className="dashboard-chart-tooltip-row">
        <span
          className="dashboard-chart-tooltip-dot"
          style={{ background: item.color ?? "#1d4ed8" }}
        />
        <span>{valueFormatter ? valueFormatter(value) : value}</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  badge,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`dashboard-chart-card${wide ? " dashboard-chart-card--wide" : ""}`}>
      <div className="dashboard-chart-header">
        <div>
          <h4 className="dashboard-chart-title">{title}</h4>
          {subtitle ? <p className="dashboard-chart-subtitle">{subtitle}</p> : null}
        </div>
        {badge ? <span className="dashboard-chart-badge">{badge}</span> : null}
      </div>
      <div className="dashboard-chart-body">{children}</div>
    </div>
  );
}

function formatCurrency(value: number) {
  return `¥ ${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function truncateLabel(name: string, max = 8) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

function calcMomRate(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function summarizeList(list: ReimbursementRecord[]) {
  let amount = 0;
  let count = 0;
  let rejected = 0;
  for (const r of list) {
    amount += getRecordAmount(r);
    count += 1;
    if (r.status === "rejected") rejected += 1;
  }
  return { amount, count, rejected };
}

export default function DashboardCharts({
  list,
  prevList,
  isAdmin,
}: {
  list: ReimbursementRecord[];
  prevList: ReimbursementRecord[];
  isAdmin: boolean;
}) {
  const { categoryData, statusData, rejectedData, trendData, departmentData, momData } =
    useMemo(() => {
      const byCategory = new Map<string, number>();
      const byStatus = new Map<string, number>();
      const rejectedByCategory = new Map<string, number>();
      const byDepartment = new Map<string, number>();
      const byDate = new Map<string, { amount: number; count: number }>();

      for (const r of list) {
        const cat = r.category || "未分类";
        const amount = getRecordAmount(r);
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);
        byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
        if (r.status === "rejected") {
          rejectedByCategory.set(cat, (rejectedByCategory.get(cat) ?? 0) + 1);
        }
        if (isAdmin) {
          const dept = r.department_name?.trim() || "未填写部门";
          byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + amount);
        }
        const dateKey = r.apply_date ?? "未填日期";
        const prev = byDate.get(dateKey) ?? { amount: 0, count: 0 };
        byDate.set(dateKey, {
          amount: prev.amount + amount,
          count: prev.count + 1,
        });
      }

      const categoryData = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, amount], i) => ({
          name: truncateLabel(name),
          fullName: name,
          amount: Math.round(amount * 100) / 100,
          fill: BLUE_PALETTE[i % BLUE_PALETTE.length],
        }));

      const statusData = ["pending", "approved", "rejected"]
        .filter((s) => (byStatus.get(s) ?? 0) > 0)
        .map((s) => ({
          name: STATUS_LABELS[s] ?? s,
          value: byStatus.get(s) ?? 0,
          status: s,
          fill: STATUS_COLORS[s],
        }));

      const rejectedData = Array.from(rejectedByCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count], i) => ({
          name: truncateLabel(name, 6),
          fullName: name,
          count,
          fill: `hsl(${8 + i * 14}, 72%, ${48 + i * 2}%)`,
        }));

      const trendData = Array.from(byDate.entries())
        .filter(([d]) => d !== "未填日期")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date: date.slice(5),
          fullDate: date,
          amount: Math.round(v.amount * 100) / 100,
          count: v.count,
        }));

      const departmentData = Array.from(byDepartment.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, amount], i) => ({
          name: truncateLabel(name, 7),
          fullName: name,
          amount: Math.round(amount * 100) / 100,
          fill: `hsl(${195 + i * 16}, 58%, ${38 + i * 3}%)`,
        }));

      const cur = summarizeList(list);
      const prev = summarizeList(prevList);
      const momData = [
        {
          metric: "报销金额",
          current: Math.round(cur.amount * 100) / 100,
          previous: Math.round(prev.amount * 100) / 100,
          rate: calcMomRate(cur.amount, prev.amount),
        },
        {
          metric: "报销笔数",
          current: cur.count,
          previous: prev.count,
          rate: calcMomRate(cur.count, prev.count),
        },
        {
          metric: "驳回笔数",
          current: cur.rejected,
          previous: prev.rejected,
          rate: calcMomRate(cur.rejected, prev.rejected),
        },
      ];

      return { categoryData, statusData, rejectedData, trendData, departmentData, momData };
    }, [list, prevList, isAdmin]);

  const totalStatus = statusData.reduce((s, i) => s + i.value, 0);

  return (
    <div className="dashboard-charts">
      <ChartCard title="环比上月" subtitle="本月与上月核心指标对比" wide>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={momData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="metric" tickLine={false} axisLine={false} />
            <YAxis yAxisId="value" tickLine={false} axisLine={false} width={48} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as (typeof momData)[0];
                return (
                  <div className="dashboard-chart-tooltip">
                    <div className="dashboard-chart-tooltip-title">{row.metric}</div>
                    <div className="dashboard-chart-tooltip-row">
                      <span className="dashboard-chart-tooltip-dot" style={{ background: "#1d4ed8" }} />
                      <span>本月 {row.metric.includes("金额") ? formatCurrency(row.current) : row.current}</span>
                    </div>
                    <div className="dashboard-chart-tooltip-row" style={{ marginTop: 4 }}>
                      <span className="dashboard-chart-tooltip-dot" style={{ background: "#94a3b8" }} />
                      <span>上月 {row.metric.includes("金额") ? formatCurrency(row.previous) : row.previous}</span>
                    </div>
                    {row.rate != null && (
                      <div className="dashboard-chart-tooltip-row" style={{ marginTop: 4 }}>
                        <span>环比 {row.rate > 0 ? "+" : ""}{row.rate}%</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => (
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{value}</span>
              )}
            />
            <Bar yAxisId="value" dataKey="current" name="本月" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar yAxisId="value" dataKey="previous" name="上月" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5">
          <ChartCard
            title="各类型报销金额"
            subtitle="按报销类型汇总本月金额"
            badge={`${categoryData.length} 类`}
          >
            {categoryData.length === 0 ? (
              <div className="dashboard-chart-empty">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `¥${v}`} />
                  <YAxis type="category" dataKey="name" width={72} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={formatCurrency} />} />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {categoryData.map((entry) => (
                      <Cell key={entry.fullName} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="xl:col-span-3">
          <ChartCard
            title="审核状态分布"
            subtitle="本月报销单状态占比"
            badge={`共 ${totalStatus} 笔`}
          >
            {statusData.length === 0 ? (
              <div className="dashboard-chart-empty">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} 笔`} />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="xl:col-span-4">
          <ChartCard
            title="驳回报销（按类型）"
            subtitle="本月被驳回的报销笔数"
            badge={`${rejectedData.reduce((s, i) => s + i.count, 0)} 笔`}
          >
            {rejectedData.length === 0 ? (
              <div className="dashboard-chart-empty">本月暂无驳回记录</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rejectedData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} 笔`} />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {rejectedData.map((entry) => (
                      <Cell key={entry.fullName} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>

      {isAdmin && (
        <ChartCard
          title="各部门报销金额"
          subtitle="按报销单所属部门汇总（管理员视图）"
          badge={`${departmentData.length} 个部门`}
          wide
        >
          {departmentData.length === 0 ? (
            <div className="dashboard-chart-empty">暂无部门数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={departmentData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `¥${v}`} />
                <YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={formatCurrency} />} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={20}>
                  {departmentData.map((entry) => (
                    <Cell key={entry.fullName} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}

      <ChartCard
        title="本月报销趋势"
        subtitle="按申请日期统计金额与笔数"
        badge={trendData.length > 0 ? `${trendData.length} 天有记录` : undefined}
        wide
      >
        {trendData.length === 0 ? (
          <div className="dashboard-chart-empty">暂无趋势数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="amountGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="amount"
                tickFormatter={(v) => `¥${v}`}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { fullDate?: string; amount?: number; count?: number };
                  return (
                    <div className="dashboard-chart-tooltip">
                      <div className="dashboard-chart-tooltip-title">{row.fullDate ?? label}</div>
                      <div className="dashboard-chart-tooltip-row">
                        <span className="dashboard-chart-tooltip-dot" style={{ background: "#3b82f6" }} />
                        <span>金额 {formatCurrency(row.amount ?? 0)}</span>
                      </div>
                      <div className="dashboard-chart-tooltip-row" style={{ marginTop: 4 }}>
                        <span className="dashboard-chart-tooltip-dot" style={{ background: "#f59e0b" }} />
                        <span>笔数 {row.count ?? 0}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{value}</span>
                )}
              />
              <Area
                yAxisId="amount"
                type="monotone"
                dataKey="amount"
                name="金额"
                stroke="#1d4ed8"
                strokeWidth={2.5}
                fill="url(#amountGradient)"
                dot={{ r: 3, fill: "#1d4ed8", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#1d4ed8" }}
              />
              <Area
                yAxisId="count"
                type="monotone"
                dataKey="count"
                name="笔数"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="transparent"
                dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
