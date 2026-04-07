// @ts-ignore xlsx-js-style 没有类型声明
import XLSXStyle from 'xlsx-js-style'
import { saveAs } from 'file-saver'
import type { ReimbursementRecord } from '../api/reimbursement'

const YELLOW_HEADER = {
  fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
  font: { bold: true, sz: 14 },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
}

const RED_CELL = {
  font: { color: { rgb: 'FF0000' }, bold: true, sz: 14 },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
}

const NORMAL_CELL = {
  font: { sz: 12 },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
}

function makeCell(value: string | number, style: object) {
  return { v: value, t: typeof value === 'number' ? 'n' : 's', s: style }
}

// 从 detail 中取 totalPrice 字段的数值
function getTotalPrice(r: ReimbursementRecord): number {
  const item = r.detail?.find((d) => d.label === '总价')
  return item ? Number(item.value) || 0 : 0
}

function buildSheet(category: string, records: ReimbursementRecord[]) {
  const detailLabels: string[] = []
  for (const r of records) {
    if (r.detail && r.detail.length > 0) {
      r.detail.forEach((d) => { if (!detailLabels.includes(d.label)) detailLabels.push(d.label) })
      break
    }
  }

  const colCount = 1 + detailLabels.length // 序号 + detail字段（不含金额列）

  // 表头（黄色）
  const headerRow = [
    makeCell('序号', YELLOW_HEADER),
    ...detailLabels.map((l) => makeCell(l, YELLOW_HEADER)),
  ]

  const dataRows = records.map((r, idx) => {
    const detailMap: Record<string, string> = {}
    r.detail?.forEach((d) => { detailMap[d.label] = d.value })
    return [
      makeCell(idx + 1, NORMAL_CELL),
      ...detailLabels.map((l) => makeCell(detailMap[l] ?? '', NORMAL_CELL)),
    ]
  })

  const categoryTotal = records.reduce((s, r) => s + getTotalPrice(r), 0)

  // 共计行（红色）
  const subtotalRow: ReturnType<typeof makeCell>[] = Array(colCount).fill(makeCell('', RED_CELL))
  subtotalRow[0] = makeCell('共计', RED_CELL)
  subtotalRow[colCount - 1] = makeCell(categoryTotal, RED_CELL)

  const aoa = [headerRow, ...dataRows, subtotalRow]
  const ws = XLSXStyle.utils.aoa_to_sheet(aoa)
  ws['!cols'] = Array(colCount).fill({ wch: 16 })
  return { ws, categoryTotal }
}

export function exportReimbursementExcel(
  list: ReimbursementRecord[],
  filterCategory?: string
) {
  const wb = XLSXStyle.utils.book_new()

  // 只保留已通过的记录
  const approvedList = list.filter(record => record.status === 'approved')

  const groups: Record<string, ReimbursementRecord[]> = {}
  for (const record of approvedList) {
    if (filterCategory && record.category !== filterCategory) continue
    if (!groups[record.category]) groups[record.category] = []
    groups[record.category].push(record)
  }

  if (Object.keys(groups).length === 0) return

  const entries = Object.entries(groups)

  if (filterCategory) {
    const [category, records] = entries[0]
    const { ws } = buildSheet(category, records)
    XLSXStyle.utils.book_append_sheet(wb, ws, category.slice(0, 31))
  } else {
    let grandTotal = 0
    const summaryData: { category: string; total: number }[] = []

    entries.forEach(([category, records]) => {
      const { ws, categoryTotal } = buildSheet(category, records)
      XLSXStyle.utils.book_append_sheet(wb, ws, category.slice(0, 31))
      grandTotal += categoryTotal
      summaryData.push({ category, total: categoryTotal })
    })

    // 总费用 sheet
    const summaryAoa = [
      [makeCell('类型', YELLOW_HEADER), makeCell('共计', YELLOW_HEADER)],
      ...summaryData.map(({ category, total }) => [
        makeCell(category, NORMAL_CELL),
        makeCell(total, NORMAL_CELL),
      ]),
      [makeCell('总费用', RED_CELL), makeCell(grandTotal, RED_CELL)],
    ]
    const wsSummary = XLSXStyle.utils.aoa_to_sheet(summaryAoa)
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 16 }]
    XLSXStyle.utils.book_append_sheet(wb, wsSummary, '总费用')
  }

  const filename = filterCategory
    ? `报销记录_${filterCategory}_${Date.now()}.xlsx`
    : `报销记录_全部_${Date.now()}.xlsx`

  const wbout = XLSXStyle.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, filename)
}
