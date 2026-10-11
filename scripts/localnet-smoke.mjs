/**
 * Kethyr Flow — 本地链上冒烟测试（CLI 密钥对作雇主 + 临时员工密钥对）。
 *
 * 覆盖：initialize_company → create_stream → claim_stream → cancel_stream，
 * 并逐条校验数值不变量（代扣分流、资金守恒、金库归零）与两个负向用例
 * （重复 cancel = StreamCancelled 6004；未开始 claim = NothingToClaim 6003）。
 *
 * 用法（在 frontend/demo 下运行，以便解析 @solana/* 依赖）：
 *   cd frontend/demo && node ../../scripts/localnet-smoke.mjs
 *
 * 依赖：本地 validator（默认 http://127.0.0.1:8899）已运行、kethyr-payroll 已部署，
 *       CLI 钱包有 SOL、且有测试 mint 的铸币权限（默认用下面的 MINT）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(
  path.resolve(process.cwd(), 'package.json'), // 期望 cwd = frontend/demo
)
const { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor')

const RPC = process.env.SOLANA_RPC ?? 'http://127.0.0.1:8899'
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR ?? `${os.homedir()}/.config/solana/id.json`
const MINT = new PublicKey(
  process.env.PAYROLL_MINT ?? '6xPgjRpt3LS3vtxQjJPitNMELtd3sDrCiLHqUqhsbsrm',
)
const IDL_PATH = path.resolve(process.cwd(), 'src/lib/solana/kethyr_payroll.idl.json')
const DECIMALS = 6
const TOTAL = 100_000_000n // 100 tokens
const RATE = 1500 // 15%
const DURATION = 120 // 秒

const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'))
const PROGRAM_ID = new PublicKey(idl.address)
const TOKEN_PROGRAM_ID = splToken.TOKEN_PROGRAM_ID
const ATA_PROGRAM_ID = splToken.ASSOCIATED_TOKEN_PROGRAM_ID

const connection = new Connection(RPC, 'confirmed')
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))),
)

// 临时员工密钥对：放在系统临时目录，跨次运行复用（localnet 一次性账户）
const empPath = path.join(os.tmpdir(), 'kethyr-smoke-employee.json')
const employee = fs.existsSync(empPath)
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(empPath, 'utf8'))))
  : Keypair.generate()
if (!fs.existsSync(empPath)) fs.writeFileSync(empPath, JSON.stringify(Array.from(employee.secretKey)))

const wallet = {
  publicKey: authority.publicKey,
  payer: authority,
  signTransaction: async (tx) => (tx.partialSign(authority), tx),
  signAllTransactions: async (txs) => (txs.forEach((t) => t.partialSign(authority)), txs),
}
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
const program = new Program(idl, provider)

const u64le = (v) => new BN(v.toString()).toArrayLike(Buffer, 'le', 8)

/**
 * 读链上 Clock 的 unix_timestamp。
 *
 * ⚠️ 不要用 `Date.now()`：`solana-test-validator` 复用旧账本时，链上时间可能
 * 落后宿主时间数小时（停止期间时钟不推进），用宿主时间会让 start 落在未来、
 * 导致 claim 报 NothingToClaim。冒烟测试以链上时钟为准。
 */
const readChainNow = async () => {
  const info = await connection.getAccountInfo(
    new PublicKey('SysvarC1ock11111111111111111111111111111111'),
  )
  return Number(info.data.readBigInt64LE(32))
}
const company = PublicKey.findProgramAddressSync(
  [Buffer.from('company'), authority.publicKey.toBuffer()],
  PROGRAM_ID,
)[0]
const streamPda = (id) =>
  PublicKey.findProgramAddressSync([Buffer.from('stream'), company.toBuffer(), u64le(id)], PROGRAM_ID)[0]
const ata = (owner, off) => splToken.getAssociatedTokenAddressSync(MINT, owner, off, TOKEN_PROGRAM_ID)
const taxVault = ata(company, true)

const fmt = (raw) => {
  const b = 10n ** BigInt(DECIMALS)
  const w = BigInt(raw) / b
  const f = BigInt(raw) % b
  return f === 0n ? `${w}` : `${w}.${f.toString().padStart(DECIMALS, '0').replace(/0+$/, '')}`
}
const bal = async (addr) => BigInt((await connection.getTokenAccountBalance(addr)).value.amount)

const results = []
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond })
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const fetchStream = async (pda) => {
  const a = await program.account.payrollStream.fetch(pda)
  return {
    total: BigInt(a.totalAmount.toString()),
    withdrawn: BigInt(a.withdrawnAmount.toString()),
    start: Number(a.startTime.toString()),
    end: Number(a.endTime.toString()),
    cancelled: a.cancelled,
  }
}
const expectErr = async (label, fn, code) => {
  try {
    await fn()
    check(`${label} 应失败`, false, '却成功了')
  } catch (err) {
    const n = err?.error?.errorCode?.number
    check(`${label} 报错 code=${n}`, n === code, `期望 ${code}`)
  }
}
const cancelAccounts = (args) => ({
  caller: authority.publicKey,
  employer: authority.publicKey,
  company,
  stream: args.stream,
  recipient: args.recipient,
  taxVault,
  vault: args.vault,
  recipientAta: args.recipientAta,
  employerAta: args.employerAta,
  mint: MINT,
  tokenProgram: TOKEN_PROGRAM_ID,
  associatedTokenProgram: ATA_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
})

console.log('\n=== 0. 准备 ===')
console.log('employer(CLI):', authority.publicKey.toBase58())
console.log('employee     :', employee.publicKey.toBase58())
if ((await connection.getBalance(employee.publicKey)) < 0.5 * LAMPORTS_PER_SOL) {
  const sig = await connection.requestAirdrop(employee.publicKey, 5 * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(sig, 'confirmed')
}
const employerAta = (await splToken.getOrCreateAssociatedTokenAccount(connection, authority, MINT, authority.publicKey)).address
const employeeAta = (await splToken.getOrCreateAssociatedTokenAccount(connection, authority, MINT, employee.publicKey)).address
await splToken.mintTo(connection, authority, MINT, employerAta, authority, Number(TOTAL))

console.log('\n=== 1. initialize_company ===')
let exists = true
try {
  await program.account.companyConfig.fetch(company)
} catch {
  exists = false
}
if (!exists) {
  await program.methods
    .initializeCompany(RATE, PublicKey.default)
    .accountsPartial({
      authority: authority.publicKey, company, mint: MINT, taxVault,
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
  check('新建税务金库余额为 0', (await bal(taxVault)) === 0n)
} else {
  console.log('  company 已存在，跳过 init')
}

console.log('\n=== 2. create_stream（100 币 / 120s / 15%，起点在过去 60s） ===')
const now = await readChainNow()
const hostNow = Math.floor(Date.now() / 1000)
if (Math.abs(hostNow - now) > 30) {
  console.log(`  ⚠️ 链上时钟与宿主相差 ${hostNow - now}s（以链上为准）`)
}
const id = BigInt(Date.now())
const stream = streamPda(id)
const vault = ata(stream, true)
const employerBefore = await bal(employerAta)
await program.methods
  .createStream(new BN(id.toString()), new BN(TOTAL.toString()), new BN(now - 60), new BN(now + 60), RATE)
  .accountsPartial({
    employer: authority.publicKey, company, authority: authority.publicKey,
    recipient: employee.publicKey, mint: MINT, employerAta, stream, vault,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc()
check('托管金库 == 100', (await bal(vault)) === TOTAL, fmt(await bal(vault)))
check('雇主被扣 100', employerBefore - (await bal(employerAta)) === TOTAL)

console.log('\n=== 3. claim_stream（employee 签名） ===')
const empBefore = await bal(employeeAta)
const taxBefore = await bal(taxVault)
await program.methods
  .claimStream(new BN(id.toString()))
  .accountsPartial({
    recipient: employee.publicKey, employer: authority.publicKey, company, stream,
    taxVault, vault, recipientAta: employeeAta, mint: MINT,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .signers([employee])
  .rpc()
let s = await fetchStream(stream)
const claimed = s.withdrawn
const netDelta = (await bal(employeeAta)) - empBefore
const taxDelta = (await bal(taxVault)) - taxBefore
check('net + tax == 本次提取额', netDelta + taxDelta === claimed, `${fmt(netDelta)} + ${fmt(taxDelta)} = ${fmt(claimed)}`)
check('tax == 提取额 * 15%', taxDelta === (claimed * BigInt(RATE)) / 10000n, fmt(taxDelta))
check('托管金库 == 100 - 已提取', (await bal(vault)) === TOTAL - claimed, fmt(await bal(vault)))

console.log('\n=== 4. cancel_stream（employer 签名，未到期） ===')
const emp2 = await bal(employeeAta)
const tax2 = await bal(taxVault)
const empBefore2 = await bal(employerAta)
await program.methods.cancelStream(new BN(id.toString())).accountsPartial(cancelAccounts({
  stream, recipient: employee.publicKey, vault, recipientAta: employeeAta, employerAta,
})).rpc()
s = await fetchStream(stream)
const paidNet = (await bal(employeeAta)) - emp2
const paidTax = (await bal(taxVault)) - tax2
const refunded = (await bal(employerAta)) - empBefore2
check('stream.cancelled == true', s.cancelled === true)
check('托管金库归零', (await bal(vault)) === 0n, fmt(await bal(vault)))
check('withdrawn + 退款 == 100', s.withdrawn + refunded === TOTAL, `${fmt(s.withdrawn)} + ${fmt(refunded)}`)
check('结清额 = net + tax', paidNet + paidTax === s.withdrawn - claimed, `${fmt(paidNet)} + ${fmt(paidTax)}`)
check('资金守恒：员工 + 税库 + 退款 == 100',
  (await bal(employeeAta)) + (await bal(taxVault)) + refunded === TOTAL,
  `${fmt(await bal(employeeAta))} + ${fmt(await bal(taxVault))} + ${fmt(refunded)}`)

console.log('\n=== 5. 负向用例 ===')
await expectErr('重复 cancel', () =>
  program.methods.cancelStream(new BN(id.toString())).accountsPartial(cancelAccounts({
    stream, recipient: employee.publicKey, vault, recipientAta: employeeAta, employerAta,
  })).rpc(), 6004)

const fid = BigInt(Date.now() + 1)
const fstream = streamPda(fid)
const fvault = ata(fstream, true)
await program.methods
  .createStream(new BN(fid.toString()), new BN(1_000_000n.toString()), new BN(now + 3600), new BN(now + 7200), RATE)
  .accountsPartial({
    employer: authority.publicKey, company, authority: authority.publicKey,
    recipient: employee.publicKey, mint: MINT, employerAta, stream: fstream, vault: fvault,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc()
await expectErr('未开始就 claim', () =>
  program.methods.claimStream(new BN(fid.toString())).accountsPartial({
    recipient: employee.publicKey, employer: authority.publicKey, company, stream: fstream,
    taxVault, vault: fvault, recipientAta: employeeAta, mint: MINT,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).signers([employee]).rpc(), 6003)
await program.methods.cancelStream(new BN(fid.toString())).accountsPartial(cancelAccounts({
  stream: fstream, recipient: employee.publicKey, vault: fvault, recipientAta: employeeAta, employerAta,
})).rpc()

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`)
if (failed.length) {
  for (const f of failed) console.log('FAIL:', f.name)
  process.exit(1)
}
console.log('链上逻辑冒烟通过 ✅')
