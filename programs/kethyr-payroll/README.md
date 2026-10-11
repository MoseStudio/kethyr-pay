# Kethyr Flow — 企业流式薪酬与财资系统（Solana / Anchor）

流式支付不做「每秒一笔交易」，而是**基于时间的纯数学确定性结算**：本金一次性注入
`stream` PDA 托管金库，员工按时间线性解锁，Claim 时在程序内**原子分流**（net 归员工、
预扣税归企业税务金库）。

## 架构

```
programs/kethyr-payroll/
└── src/
    ├── lib.rs                      # program! 分发 + declare_id!
    ├── constants.rs                # seeds / BPS_BASE
    ├── error.rs                    # PayrollError
    ├── events.rs                   # StreamCreated / Claimed / StreamCancelled ...
    ├── state/
    │   ├── company_config.rs       # CompanyConfig PDA
    │   └── payroll_stream.rs       # PayrollStream PDA + 解锁数学
    └── instructions/
        ├── initialize_company.rs   # 建企业 + 税务金库 ATA
        ├── update_company.rs       # 更新税率 / 审计员
        ├── create_stream.rs        # 开流 + 注入本金
        ├── claim_stream.rs         # 提取 + 原子代扣
        ├── cancel_stream.rs        # 离职结算 + 退款
        └── close_stream.rs         # 关闭账户回收租金
```

## 账户与 PDA

| 账户 | Seeds | 说明 |
|---|---|---|
| `CompanyConfig` | `[b"company", authority]` | 企业税率、发薪 mint、税务金库、审计员 |
| `PayrollStream` | `[b"stream", company, stream_id_le(8)]` | 单条流：总额、已提取、起止时间、税率快照 |
| 托管金库 | `ATA(stream PDA, mint, token_program)` | 持有本金，authority 为 stream PDA |
| 税务金库 | `ATA(company PDA, mint, token_program)` | 归集预扣税，authority 为 company PDA |

> 采用 `token_interface`（`InterfaceAccount` / `TokenInterface`）+ `transfer_checked`，
> 因此同一份代码同时兼容**经典 SPL Token 与 Token-2022** mint。

## 解锁与代扣数学

```text
unlocked  = min(total, total * (now - start) / (end - start))
claimable = unlocked - withdrawn
tax       = claimable * rate / 10000        // rate 为 bps，1500 = 15%
net       = claimable - tax                 // 取整归 net
```

所有 `total * elapsed` 均以 `u128` 中间量计算，杜绝 `u64` 溢出（release 下开启
`overflow-checks = true`）。

## 指令

| 指令 | 签名 | 说明 |
|---|---|---|
| `initialize_company` | `(withholding_rate: u16, auditor: Pubkey)` | 建 `CompanyConfig` 与税务金库 ATA |
| `update_company` | `(withholding_rate: u16, auditor: Pubkey)` | 仅 authority 可改 |
| `create_stream` | `(stream_id: u64, total_amount: u64, start_time: i64, end_time: i64, withholding_rate: u16)` | 建流 + `transfer_checked` 注入本金 |
| `claim_stream` | `(stream_id: u64)` | 员工签名；净额→员工、税→税务金库 |
| `cancel_stream` | `(stream_id: u64)` | 雇主或员工可触发；结清已工作额度 + 退还未解锁部分 |
| `close_stream` | `(stream_id: u64)` | 已终止且金库清空后关闭账户回收租金 |

## 构建 / 部署

```bash
# 仓库根目录
anchor build
anchor keys list          # 记录 program id
anchor deploy --provider.cluster devnet
```

> **工具链注意**：`programs/kethyr-payroll/Cargo.toml` 通过
> `[package.metadata.solana] tools-version = "v1.52"` 固定 platform-tools。
> 默认 platform-tools（Rust 1.84）无法解析部分依赖的 edition 2024 manifest。

## 前端

薪酬看板位于 `frontend/demo/src/`：

- `lib/solana/vesting.ts` — 零依赖解锁数学（与链上逐位一致，含单测）
- `lib/solana/payroll.ts` — PDA 推导 / IDL / Anchor 账户命名空间
- `hooks/useStreamingBalance.ts` — `requestAnimationFrame` 毫秒级插值跳动余额
- `hooks/useSolanaPayroll.ts` / `usePayrollStreams.ts` — Anchor 客户端与账户订阅
- `components/payroll/*` + `routes/payroll.*` — 雇主控制台与员工水表视图

改程序后需 `anchor build && cd frontend/demo && pnpm sync-idl` 同步 IDL。

## 验证（本阶段交付不含测试套件）

```bash
anchor build
cd frontend/demo && pnpm typecheck && pnpm lint && pnpm test
```

手动 E2E：在 devnet 建测试 mint → `/payroll` 初始化企业 → 开流 → `/payroll/employee`
观察余额跳动并 Claim → 到期前用雇主钱包 Cancel 验证结算与退款。
