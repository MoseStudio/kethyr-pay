/**
 * 通用展示格式化（与链无关，便于单测）。
 */

/** 截断长地址用于展示（如 `CzEEKYrw…qytJz`）。 */
export function truncateAddress(address: string, head = 8, tail = 6): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}
