export const PROGRAM_ID = 'escrow_subscription.aleo'
export const ALEO_CHAIN_ID = 'testnet'
export const DEFAULT_FEE = 100000

export const USE_REAL_TRANSACTIONS =
  import.meta.env?.VITE_USE_REAL_TRANSACTIONS === 'true'

export const MOCK_FALLBACK =
  import.meta.env?.VITE_MOCK_FALLBACK !== 'false'

export interface EscrowRecordPlaintext {
  owner: string
  merchant: string
  total_amount: string | number
  remaining_amount: string | number
  interval: string | number
  created_at: string | number
  last_charged_at: string | number
  serial_number: string | number
  _nonce: string
}

export interface PaymentRecordPlaintext {
  owner: string
  merchant: string
  amount: string | number
  period: string | number
  escrow_serial_reference: string | number
}

export function isValidAleoAddress(value: string): boolean {
  return /^aleo1[a-z0-9]{58}$/.test(value)
}

export function creditsToMicrocredits(credits: string): bigint {
  const parsed = parseFloat(credits)
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid credit amount: ${credits}`)
  }
  return BigInt(Math.round(parsed * 1_000_000))
}

export function microcreditsToCredits(microcredits: bigint | number): string {
  const value = typeof microcredits === 'number' ? BigInt(microcredits) : microcredits
  return (Number(value) / 1_000_000).toFixed(6)
}

export function encodeAddress(address: string): string {
  if (!isValidAleoAddress(address)) {
    throw new Error(`Invalid Aleo address: ${address}`)
  }
  return address
}

export function encodeU64(credits: string): string {
  return `${creditsToMicrocredits(credits).toString()}u64`
}

export function encodeU32(value: string | number): string {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 4_294_967_295) {
    throw new Error(`Invalid u32 value: ${value}`)
  }
  return `${parsed}u32`
}

export function stripVisibilitySuffix(value: string | number): string {
  return String(value).trim().replace(/\.(private|public)$/, '')
}

export function parseEscrowRecord(
  input: string,
): EscrowRecordPlaintext | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (
      typeof parsed.owner === 'string' &&
      typeof parsed.merchant === 'string' &&
      (typeof parsed.total_amount === 'string' ||
        typeof parsed.total_amount === 'number') &&
      (typeof parsed.remaining_amount === 'string' ||
        typeof parsed.remaining_amount === 'number') &&
      (typeof parsed.interval === 'string' ||
        typeof parsed.interval === 'number') &&
      (typeof parsed.created_at === 'string' ||
        typeof parsed.created_at === 'number') &&
      (typeof parsed.last_charged_at === 'string' ||
        typeof parsed.last_charged_at === 'number') &&
      (typeof parsed.serial_number === 'string' ||
        typeof parsed.serial_number === 'number') &&
      typeof parsed._nonce === 'string'
    ) {
      return {
        owner: stripVisibilitySuffix(parsed.owner),
        merchant: stripVisibilitySuffix(parsed.merchant),
        total_amount: stripVisibilitySuffix(parsed.total_amount),
        remaining_amount: stripVisibilitySuffix(parsed.remaining_amount),
        interval: stripVisibilitySuffix(parsed.interval),
        created_at: stripVisibilitySuffix(parsed.created_at),
        last_charged_at: stripVisibilitySuffix(parsed.last_charged_at),
        serial_number: stripVisibilitySuffix(parsed.serial_number),
        _nonce: stripVisibilitySuffix(parsed._nonce),
      }
    }
  } catch {
    // Fall through to plaintext parse attempt
  }

  const ownerMatch = /owner:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
  const merchantMatch = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
  const nonceMatch = /_nonce:\s*([0-9]+group)/.exec(trimmed)
  if (ownerMatch && merchantMatch && nonceMatch) {
    const extract = (key: string): string | null => {
      const re = new RegExp(`${key}:\\s*([^,}\\s]+)`)
      const m = re.exec(trimmed)
      return m ? stripVisibilitySuffix(m[1]) : null
    }
    return {
      owner: ownerMatch[1],
      merchant: merchantMatch[1],
      total_amount: extract('total_amount') ?? '',
      remaining_amount: extract('remaining_amount') ?? '',
      interval: extract('interval') ?? '',
      created_at: extract('created_at') ?? '',
      last_charged_at: extract('last_charged_at') ?? '',
      serial_number: extract('serial_number') ?? '',
      _nonce: stripVisibilitySuffix(nonceMatch[1]),
    }
  }

  return null
}

export function formatRecordInput(
  record: EscrowRecordPlaintext,
): string {
  const normalizeNumber = (
    value: string | number,
    suffix: 'u64' | 'u32' | 'field',
  ): string => {
    let str = stripVisibilitySuffix(value)
    if (str.endsWith(suffix)) return str
    const parsed = Number(str)
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid ${suffix} value in record: ${value}`)
    }
    return `${Math.trunc(parsed)}${suffix}`
  }

  return `{
    owner: ${record.owner},
    merchant: ${record.merchant},
    total_amount: ${normalizeNumber(record.total_amount, 'u64')},
    remaining_amount: ${normalizeNumber(record.remaining_amount, 'u64')},
    interval: ${normalizeNumber(record.interval, 'u32')},
    created_at: ${normalizeNumber(record.created_at, 'u32')},
    last_charged_at: ${normalizeNumber(record.last_charged_at, 'u32')},
    serial_number: ${normalizeNumber(record.serial_number, 'field')},
    _nonce: ${record._nonce}
  }`
}

/**
 * Use the user's pasted record input as-is. Shield Wallet expects the original
 * visibility suffixes (`.private` / `.public`) to remain on every field;
 * re-formatting the record removes them and causes "Failed to parse input".
 *
 * We keep `_version` if present because the wallet/prover may use it for
 * record-version checks.
 */
export function cleanRecordInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    const fields = [
      `owner: ${parsed.owner}`,
      `merchant: ${parsed.merchant}`,
      `total_amount: ${parsed.total_amount}`,
      `remaining_amount: ${parsed.remaining_amount}`,
      `interval: ${parsed.interval}`,
      `created_at: ${parsed.created_at}`,
      `last_charged_at: ${parsed.last_charged_at}`,
      `serial_number: ${parsed.serial_number}`,
      `_nonce: ${parsed._nonce}`,
    ]
    if (parsed._version !== undefined) {
      fields.push(`_version: ${parsed._version}`)
    }
    return `{\n  ${fields.join(',\n  ')}\n}`
  } catch {
    // Already a Leo record literal; return it unchanged.
    return trimmed
  }
}

import type { TransactionOptions } from '@provablehq/aleo-types'

export function createTransactionOptions(
  functionName: string,
  inputs: string[],
  program = PROGRAM_ID,
  fee = DEFAULT_FEE,
  privateFee = false,
): TransactionOptions {
  return {
    program,
    function: functionName,
    inputs,
    fee,
    privateFee,
  }
}
