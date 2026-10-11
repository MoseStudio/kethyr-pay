# Kethyr Flow — Solana 流式薪酬与财资协议

> **Colosseum 黑客松 · Solana 赛道**

**在线演示（devnet）：** <https://kethyrpay.suseayah.workers.dev/payroll> · [评委实测指南](docs/DEMO_DEVNET.md)

<div align="center">

**[English](README.md) · [简体中文](README.CN.md)**

</div>

---

工资不是一个「每月一次的事件」，它随时间连续产生。**Kethyr Flow** 把它变成 Solana 上
一个持续累积的债权：

- 老板**一次性**为一条流注入本金，钱进入由程序托管的金库；
- 员工的余额**随时间线性解锁**，由一个纯公式决定；
- 员工想什么时候提就什么时候提，预扣税在**同一条指令里原子地**分流进企业税务金库；
- **没有每秒的交易** —— 结算是惰性的：只有 claim 时链上状态才变。所以一条流跑一小时和跑
  一年，链上成本完全一样。

---

## 目录

- [要解决的问题](#要解决的问题)
- [工作原理](#工作原理)
- [链上参考](#链上参考)
- [前端](#前端)
- [仓库结构](#仓库结构)
- [Devnet 部署](#devnet-部署)
- [本地运行](#本地运行)
- [评委实测路线](#评委实测路线)
- [验证](#验证)
- [Roadmap](#roadmap)
- [已知限制（如实说明）](#已知限制如实说明)

---

## 要解决的问题

| 谁 | 痛点 | Kethyr Flow |
|---|---|---|
| 雇主 | 发薪是「每月批处理」：钱在劳动之后才动 | 只注资一次，余额按秒累积 |
| 员工 | 已经赚到的钱要等 30 天才能拿到 | 任意时刻、任意额度提取，精度到秒 |
| 财务/税务 | 代扣在表格里算，和资金流脱节 | 代扣在**同一笔交易内**拆分并进入预留的税务金库 |
| 远程/跨境团队 | 结算延迟以天计 | 结算 = 员工想提时的一次签名 |
| 离职结算 | 「干了但没结清」的扯皮 | `cancel_stream` 确定性结算已工作部分、退回剩余额度 |

## 工作原理

### 1. 企业初始化 — `initialize_company`

雇主创建 `CompanyConfig` PDA 和一个**税务金库**（由该 PDA 持有的 ATA）。企业绑定一种发薪
代币与一个默认预扣税率（bps，`1500` = 15%）。

### 2. 开流 — `create_stream`

传入 `stream_id`、`total_amount`、`start_time`、`end_time`、`withholding_rate`。指令创建
`PayrollStream` PDA 与一个**金库**（stream PDA 持有的 ATA），并把**全额本金**转入其中。
从这一刻起，这笔钱不再属于雇主 —— 它已经被承诺出去了。

### 3. 连续解锁 — 纯数学，不发交易

```
duration  = end_time - start_time
unlocked  = min(total, total × (now - start_time) / duration)   // 开始前为 0，结束后封顶
claimable = unlocked - withdrawn_amount
```

`now` 取自链上 `Clock` 的 unix 时间戳。中间量全程用 `u128`，所以 `u64` 总额不可能溢出。这是
**确定性解锁**：余额只取决于时间，不取决于谁调用了什么。前端用同一个公式逐帧本地计算，
所以余额能在**不发一次 RPC** 的情况下持续跳动。

### 4. 提取 — `claim_stream`（原子代扣）

```
tax = claimable × withholding_rate / 10_000
net = claimable - tax
```

同一条指令里两笔 `transfer_checked`：`net` → 员工，`tax` → 企业税务金库；
`withdrawn_amount += claimable`。要么两笔都成功，要么整笔回滚 —— **不存在「发了工资但没代扣」
的中间态**。

### 5. 终止结算 — `cancel_stream`

**雇主或员工都可以**触发（离职、争议、结算）。它把已工作的额度结清给员工（含代扣），
并把 `total − unlocked` 退回雇主，然后标记该流已终止。随后 `close_stream` 回收金库与账户租金。

## 链上参考

程序：`programs/kethyr-payroll` · Anchor **0.32.x** · Rust 2021

### 账户

| 账户 | Seeds | 内容 |
|---|---|---|
| `CompanyConfig` | `[b"company", authority]` | 企业主、发薪 mint、税务金库、审计员、默认税率、已开流计数 |
| `PayrollStream` | `[b"stream", company, stream_id_le]` | 雇主、员工、mint、金库、`total_amount`、`withdrawn_amount`、起止时间、税率、是否终止 |
| 金库 | `ATA(stream PDA, mint, token_program)` | 该流的本金 |
| 税务金库 | `ATA(company PDA, mint, token_program)` | 代扣税，归属企业 |

### 指令

| 指令 | 参数 | 说明 |
|---|---|---|
| `initialize_company` | `withholding_rate: u16, auditor: pubkey` | 建配置 + 税务金库 |
| `update_company` | `withholding_rate: u16, auditor: pubkey` | 仅企业主 |
| `create_stream` | `stream_id: u64, total_amount: u64, start_time: i64, end_time: i64, withholding_rate: u16` | 同一笔交易内完成注资 |
| `claim_stream` | `stream_id: u64` | 仅员工；原子 net/tax 分流 |
| `cancel_stream` | `stream_id: u64` | 雇主**或**员工；结算 + 退款 |
| `close_stream` | `stream_id: u64` | 仅在「已终止且金库为空」时；回收租金 |

IDL：`frontend/demo/src/lib/solana/kethyr_payroll.idl.json`（用
`anchor build && cd frontend/demo && pnpm sync-idl` 重新生成）。

### 代币兼容性

所有代币流转都走 `anchor_spl::token_interface` + `transfer_checked`，金库地址用
`get_associated_token_address_with_program_id(..., token_program)` 推导。因此**经典 SPL Token
与 Token-2022 都能用** —— token program 是入参，不是写死的。

### 错误码

`InvalidTimeRange` · `InvalidWithholdingRate` · `InvalidAmount` · `NothingToClaim` ·
`StreamCancelled` · `StreamNotCancelled` · `Unauthorized` · `MathOverflow` · `VaultNotEmpty`

### 事件

`CompanyInitialized` · `CompanyUpdated` · `StreamCreated` · `Claimed` · `StreamCancelled` · `StreamClosed`

## 前端

两个界面，刻意做成两种产品：

| 路由 | 面向 | 内容 |
|---|---|---|
| `/payroll` | 雇主 | 企业初始化、税率设置、开流、流的实时列表、金库余额 |
| `/payroll/employee` | 员工 | 独立门户（不是后台壳）：跳动余额水表 + 一键 Claim |

- **水表**：`requestAnimationFrame` 插值（`src/lib/solana/vesting.ts` 是纯函数、零依赖、有单测）
  驱动 [NumberFlow](https://number-flow.barvian.me) 做逐位滚动，而不是整串文本替换。
- **钱包**：Phantom，仅客户端加载；Solana 相关 chunk 用 `lazy()` 动态导入，**不进入 SSR
  （Cloudflare Worker）模块图**。
- **技术栈**：TanStack Start + React 19 + Tailwind v4，部署为 Cloudflare Worker。

## 仓库结构

```text
Anchor.toml                     Anchor 工作区
programs/kethyr-payroll/        Solana 程序（本项目核心）
frontend/demo/                  TanStack Start 前端（雇主页 + 员工门户）
scripts/localnet-fund.sh        给任意地址充值（SOL + ATA + 代币）
scripts/localnet-smoke.mjs      链上冒烟测试：断言协议不变量（13 项）
scripts/devnet-setup.sh         devnet 一键准备：部署 + 建 mint + 给演示钱包充值
docs/DEMO_DEVNET.md             面向评委的实测指南
```

## Devnet 部署

| | |
|---|---|
| 程序 | `Afm1YLnn7WBqbGgBvtxt8GMdV4LbogNqkhbtErXouP4v` |
| 发薪 mint | `FZajpoDvjLbpdeK2CvcdGmg1wGqcWrVYqvYC2thFcp8m`（6 位小数） |
| 浏览器 | `https://explorer.solana.com/address/<地址>?cluster=devnet` |
| 应用 | <https://kethyrpay.suseayah.workers.dev/payroll> |

## 本地运行

需要：Rust + `anchor` 0.32、Solana CLI、`spl-token`。

```bash
# 1. 本地 validator
solana-test-validator --reset

# 2. 构建并部署程序
anchor build
anchor deploy --provider.cluster localnet

# 3. 建一个测试 mint，并把地址填给前端
spl-token create-token --decimals 6 --url http://127.0.0.1:8899   # 记下地址
#   → frontend/demo/.env:  VITE_PAYROLL_MINT=<mint>

# 4. 给两个钱包充值（方便你同时测雇主与员工）
sh scripts/localnet-fund.sh <EMPLOYER_WALLET>
sh scripts/localnet-fund.sh <EMPLOYEE_WALLET>

# 5. 起前端
cd frontend/demo && pnpm install && pnpm dev     # http://localhost:3002
```

`pnpm dev` 读 `frontend/demo/.env`（localnet），`pnpm build` 读
`frontend/demo/.env.production`（devnet）。RPC 端点在构建时注入，例如
`VITE_SOLANA_RPC=… pnpm build`；未设置时回退公共 devnet 端点。

### 不开浏览器验证协议

```bash
cd frontend/demo && node ../../scripts/localnet-smoke.mjs
# 打 devnet：
cd frontend/demo && SOLANA_RPC=https://api.devnet.solana.com node ../../scripts/localnet-smoke.mjs
```

冒烟测试会开流、提取、终止，并逐条校验数字：代扣分流、`net + tax == 本次提取额`、金库耗尽、
资金守恒，以及两个预期的失败（`StreamCancelled` 6004、`NothingToClaim` 6003）。

## 评委实测路线

完整分步版（含预充值演示钱包）见 [`docs/DEMO_DEVNET.md`](docs/DEMO_DEVNET.md)。简版：

1. Phantom 切到 **Devnet**，导入现场提供的演示钱包。
2. 用 **Employer** 打开 `/payroll` → 初始化企业 → 开一条 `100` 代币的流，结束时间设为
   **60 秒后**，税率 `1500`（=15%）。
3. 看员工门户 `/payroll/employee` 的数字跳动，然后点 **Claim**：净额进员工钱包，恰好 15%
   进企业税务金库。
4. 切回 Employer，在结束前点 **Terminate & settle**：已工作部分结清，未赚取部分退回雇主。

## 验证

- `anchor build` —— 无告警、无 SBF 栈帧超限
- `scripts/localnet-smoke.mjs` —— **13/13** 项不变量断言（也可对 devnet 运行）
- `frontend/demo` 的 `pnpm test` —— **127** 个单测（解锁数学、格式化、金额解析……）
- `pnpm typecheck` / `pnpm lint` —— 干净
- 真实 Chromium 全路由检查（无 page/console 错误）+ 生产构建通过

## Roadmap

1. **合规级隐私** —— 每个企业发一枚带 `ConfidentialTransferMint` 扩展的 **Token-2022 mint**，
   并在 mint 上设置企业的**审计员** ElGamal 公钥：转账金额变成 ElGamal 密文，对第三方不可见，
   但税务/审计方可以解密。（程序已经在用 `token_interface`，token program 本来就是入参。）
2. **连排期也隐藏** —— 目前 `PayrollStream` 里 `total_amount` / `withholding_rate` /
   `start_time` / `end_time` 是明文，即使金额加密，观察者仍能反推工资。下一步：链上只存承诺，
   用电路证明「按承诺应解锁多少」。
3. 元数据隐私（用中继/paymaster 让「雇主→员工」关系图不再公开）、闲置资金生息、多币种发薪、
   主网部署。

## 已知限制（如实说明）

- **今天金额是公开的。** `PayrollStream` 与金库都是普通账户：任何人读到一条流就能推出某员工的
  税前工资。Roadmap 第 1 条能隐藏**金额**，第 2 条才能隐藏**排期**。与其暗示一个还没落地的
  隐私承诺，不如把边界说清楚。
- 一个企业绑定一种发薪代币（`CompanyConfig`），这是有意为之 —— 也正因为如此，才能给每个企业
  配独立的审计员密钥。
- 结算精度为 1 秒（`Clock` sysvar）。
- `claim_stream` 只付 `claimable`；没有新增解锁时调用会返回 `NothingToClaim`，这是设计如此。

## License

MIT
