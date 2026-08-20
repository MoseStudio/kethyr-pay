/**
 * MerchantKpiCards — Orders 页面顶部三张 KPI 卡片。
 *
 * 卡片规格（按 spec）：
 *   - bg-zinc-50 dark:bg-zinc-900/60
 *   - border border-zinc-200/60 dark:border-zinc-800/60
 *   - rounded-2xl p-5
 *   - label: text-xs text-zinc-500 dark:text-zinc-400 font-medium
 *   - value: text-2xl md:text-3xl font-semibold text-zinc-900 dark:text-zinc-100
 *
 * 数据：AOV 在分母为 0 时显示「$0」，避免 NaN。
 */

export interface MerchantKpiCardsProps {
  ordersCount: number
  /** 累计金额（credits 十进制字符串，6 位小数） */
  totalAmountCredits: string
}

export function MerchantKpiCards({
  ordersCount,
  totalAmountCredits,
}: MerchantKpiCardsProps) {
  const avg = computeAverage(totalAmountCredits, ordersCount)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <KpiCard label="Orders" value={String(ordersCount)} />
      <KpiCard label="Revenue" value={`${formatCredits(totalAmountCredits)} ALEO`} />
      <KpiCard label="Average Order Value" value={`${avg} ALEO`} />
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/60">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="text-2xl font-semibold text-zinc-900 md:text-3xl dark:text-zinc-100">
        {value}
      </p>
    </div>
  )
}

/** 去掉 6 位小数字符串的多余末尾 0（"1.500000" → "1.5"） */
function formatCredits(amount: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return amount
  return String(n)
}

/** AOV：累计金额 / 订单数；分母为 0 时返回 "0" */
function computeAverage(total: string, count: number): string {
  if (count <= 0) return '0'
  const totalNum = Number(total)
  if (!Number.isFinite(totalNum)) return '0'
  const avg = totalNum / count
  // 保留 6 位有效精度（去掉多余的 0），符合链上 microcredits 折算精度
  return String(Number(avg.toFixed(6)))
}