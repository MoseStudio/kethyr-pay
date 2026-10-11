/**
 * Kethyr Flow — Solana 薪酬模块的 PDA / IDL 层。
 *
 * 数学与格式化在 `vesting.ts`（零依赖），此处只负责链上地址推导与 IDL。
 */

import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import type { Idl, Program } from '@coral-xyz/anchor'

import idlJson from './kethyr_payroll.idl.json'

export * from './vesting.ts'

/** Anchor IDL（`anchor build` 产物，由 `pnpm sync-idl` 拷贝）。 */
export const PAYROLL_IDL = idlJson as unknown as Idl

/** 程序 ID：优先取 env，回退到 IDL 内嵌地址。 */
export const PAYROLL_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PAYROLL_PROGRAM_ID ??
    (idlJson as unknown as { address: string }).address,
)

const COMPANY_SEED = 'company'
const STREAM_SEED = 'stream'

/** u64 → 8 字节小端 Buffer（与 Rust `stream_id.to_le_bytes()` 一致）。 */
export function u64ToLeBytes(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(value & 0xffffffffffffffffn)
  return buf
}

/** `[COMPANY_SEED, authority]` */
export function deriveCompanyConfig(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(COMPANY_SEED), authority.toBuffer()],
    PAYROLL_PROGRAM_ID,
  )[0]
}

/** `[STREAM_SEED, company, stream_id]` */
export function deriveStreamPda(company: PublicKey, streamId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(STREAM_SEED), company.toBuffer(), u64ToLeBytes(streamId)],
    PAYROLL_PROGRAM_ID,
  )[0]
}

/** 托管金库：stream PDA 持有的 ATA。 */
export function deriveVault(
  stream: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, stream, true, tokenProgram)
}

/** 税务金库：company PDA 持有的 ATA。 */
export function deriveTaxVault(
  company: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, company, true, tokenProgram)
}

/** 生成一个客户端流编号（毫秒时间戳，企业内递增且唯一）。 */
export function nextStreamId(): bigint {
  return BigInt(Date.now())
}

/* ------------------------------------------------------------------ */
/* Anchor 账户命名空间（恢复类型）                                      */
/* ------------------------------------------------------------------ */

export interface AnchorAccountClient<T> {
  fetch(address: PublicKey): Promise<T>
  all(
    filters?: { memcmp: { offset: number; bytes: string } }[],
  ): Promise<{ publicKey: PublicKey; account: T }[]>
}

export interface PayrollAccounts {
  companyConfig: AnchorAccountClient<Record<string, unknown>>
  payrollStream: AnchorAccountClient<Record<string, unknown>>
}

/**
 * 以泛型 `Idl` 构造的 `Program` 其 `account` 命名空间没有静态键，
 * 此辅助函数把动态账户客户端恢复为具体类型。
 */
export function payrollAccounts(program: Program): PayrollAccounts {
  return program.account as unknown as PayrollAccounts
}
