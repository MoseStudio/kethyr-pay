/**
 * useSolanaPayroll — Anchor Program 客户端封装（Kethyr Flow）。
 *
 * 从 wallet-adapter 的 `useConnection/useWallet` 构造 AnchorProvider + Program，
 * 暴露 6 个指令的高层方法。所有 PDA 由 `lib/solana/payroll.ts` 推导。
 *
 * 注意：本 hook 依赖 Solana 钱包上下文，只应在 `useSolanaReady() === true`
 * 的组件子树中调用（见 SolanaProvider）。
 */

import { useCallback, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'

import {
  PAYROLL_IDL,
  deriveCompanyConfig,
  deriveStreamPda,
  deriveTaxVault,
  deriveVault,
} from '@/lib/solana/payroll.ts'

export interface InitializeCompanyArgs {
  mint: PublicKey
  withholdingRate: number
  auditor?: PublicKey
  tokenProgram?: PublicKey
}

export interface CreateStreamArgs {
  streamId: bigint
  recipient: PublicKey
  totalAmount: bigint
  startTime: number
  endTime: number
  withholdingRate: number
  mint: PublicKey
  tokenProgram?: PublicKey
}

export interface StreamActionArgs {
  streamId: bigint
  company: PublicKey
  employer: PublicKey
  recipient: PublicKey
  mint: PublicKey
  tokenProgram?: PublicKey
}

export interface UseSolanaPayrollResult {
  program: Program | null
  ready: boolean
  initializeCompany: (args: InitializeCompanyArgs) => Promise<string>
  updateCompany: (args: {
    withholdingRate: number
    auditor?: PublicKey
  }) => Promise<string>
  createStream: (args: CreateStreamArgs) => Promise<string>
  claimStream: (args: StreamActionArgs) => Promise<string>
  cancelStream: (args: StreamActionArgs) => Promise<string>
  closeStream: (args: StreamActionArgs) => Promise<string>
}

export function useSolanaPayroll(): UseSolanaPayrollResult {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey } = wallet

  const program = useMemo(() => {
    if (!publicKey) return null
    // wallet-adapter 的 WalletContextState 实现了 AnchorProvider 需要的
    // publicKey / signTransaction / signAllTransactions 子集。
    const provider = new AnchorProvider(connection, wallet as never, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    })
    // Anchor 0.31+ 的 Program 构造签名为 (idl, provider)：program id 取自
    // IDL 的 `address` 字段，因此不再单独传 programId。
    return new Program(PAYROLL_IDL, provider)
  }, [connection, wallet, publicKey])

  const initializeCompany = useCallback(
    async (args: InitializeCompanyArgs) => {
      if (!program || !publicKey) throw new Error('Wallet not connected')
      const company = deriveCompanyConfig(publicKey)
      const tokenProgram = args.tokenProgram ?? TOKEN_PROGRAM_ID
      const taxVault = deriveTaxVault(company, args.mint, tokenProgram)
      return program.methods
        .initializeCompany(args.withholdingRate, args.auditor ?? PublicKey.default)
        .accountsPartial({
          authority: publicKey,
          company,
          mint: args.mint,
          taxVault,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    },
    [program, publicKey],
  )

  const updateCompany = useCallback(
    async (args: { withholdingRate: number; auditor?: PublicKey }) => {
      if (!program || !publicKey) throw new Error('Wallet not connected')
      const company = deriveCompanyConfig(publicKey)
      return program.methods
        .updateCompany(args.withholdingRate, args.auditor ?? PublicKey.default)
        .accountsPartial({ authority: publicKey, company })
        .rpc()
    },
    [program, publicKey],
  )

  const createStream = useCallback(
    async (args: CreateStreamArgs) => {
      if (!program || !publicKey) throw new Error('Wallet not connected')
      const company = deriveCompanyConfig(publicKey)
      const stream = deriveStreamPda(company, args.streamId)
      const tokenProgram = args.tokenProgram ?? TOKEN_PROGRAM_ID
      const vault = deriveVault(stream, args.mint, tokenProgram)
      const employerAta = getAssociatedTokenAddressSync(
        args.mint,
        publicKey,
        false,
        tokenProgram,
      )
      return program.methods
        .createStream(
          new BN(args.streamId.toString()),
          new BN(args.totalAmount.toString()),
          new BN(args.startTime),
          new BN(args.endTime),
          args.withholdingRate,
        )
        .accountsPartial({
          employer: publicKey,
          company,
          authority: publicKey,
          recipient: args.recipient,
          mint: args.mint,
          employerAta,
          stream,
          vault,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
    },
    [program, publicKey],
  )

  const buildAction = useCallback(
    (name: 'claimStream' | 'cancelStream' | 'closeStream') =>
      async (args: StreamActionArgs) => {
        if (!program || !publicKey) throw new Error('Wallet not connected')
        const company = deriveCompanyConfig(args.employer)
        const stream = deriveStreamPda(company, args.streamId)
        const tokenProgram = args.tokenProgram ?? TOKEN_PROGRAM_ID
        const vault = deriveVault(stream, args.mint, tokenProgram)
        const taxVault = deriveTaxVault(company, args.mint, tokenProgram)
        const recipientAta = getAssociatedTokenAddressSync(
          args.mint,
          args.recipient,
          false,
          tokenProgram,
        )
        const employerAta = getAssociatedTokenAddressSync(
          args.mint,
          args.employer,
          false,
          tokenProgram,
        )
        const base = {
          company,
          employer: args.employer,
          stream,
          mint: args.mint,
          vault,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }

        if (name === 'claimStream') {
          return program.methods
            .claimStream(new BN(args.streamId.toString()))
            .accountsPartial({
              ...base,
              recipient: publicKey,
              taxVault,
              recipientAta,
            })
            .rpc()
        }

        if (name === 'cancelStream') {
          return program.methods
            .cancelStream(new BN(args.streamId.toString()))
            .accountsPartial({
              ...base,
              caller: publicKey,
              // CancelStream 的 recipient 是 `address = stream.recipient` 的 SystemAccount，
              // 必须显式传入（不能依赖 Anchor 自动解析表达式地址）。
              recipient: args.recipient,
              taxVault,
              recipientAta,
              employerAta,
            })
            .rpc()
        }

        return program.methods
          .closeStream(new BN(args.streamId.toString()))
          .accountsPartial({
            employer: publicKey,
            company,
            authority: args.employer,
            stream,
            vault,
            tokenProgram,
          })
          .rpc()
      },
    [program, publicKey],
  )

  const claimStream = useMemo(() => buildAction('claimStream'), [buildAction])
  const cancelStream = useMemo(() => buildAction('cancelStream'), [buildAction])
  const closeStream = useMemo(() => buildAction('closeStream'), [buildAction])

  return {
    program,
    ready: program !== null,
    initializeCompany,
    updateCompany,
    createStream,
    claimStream,
    cancelStream,
    closeStream,
  }
}
