# Demo 操作流程（线上黑客松评委自助体验）

> 本指南面向**线上评审/观众**：无需区块链或零知识证明背景，只需浏览器 +
> Shield Wallet 扩展，按步骤操作即可在 Testnet 上走完一笔**真实的隐私支付**。
> 全程非 mock：含真实 ZK 证明生成、真实 credits 转账、链上确认。
> 预计耗时：5–8 分钟（含首次 WASM 加载与证明生成）。

---

## 这是什么

KethyrPay 是一个**隐私优先的 Stripe-like 支付网关**。本 Demo 展示一笔完整闭环：

```
商家创建发票 → 把发票转给付款人 → 付款人支付（先转 credits，再消费发票）
→ 链上确认 → 商家后台看到收款明细
```

关键点：整笔支付在链上是**加密**的（金额、付款人身份仅商家可解密），
但资金（Aleo credits）真实流动、可在浏览器中核对。v3 升级为**单笔交易
原子结算**：`pay_invoice` 一次完成 `credits.aleo::transfer_private` +
消费 InvoiceRecord + 产出商家 + 付款人双 Receipt，任一步失败整笔回滚。

---

## 0. 准备工作（3 分钟）

### 安装钱包

1. 安装 **Shield Wallet** 浏览器扩展：
   - Chrome：访问扩展商店搜索 "Shield Wallet" 并安装
   - 或访问官方渠道获取
2. 点击扩展图标 → 创建/导入一个钱包 → 切换到 **Testnet** 网络
3. **重要**：Demo 需要两个钱包角色（商家 + 付款人），两种方案任选：

| 方案 | 做法 |
|------|------|
| **A（推荐，双浏览器）** | 用 Chrome + Firefox 各装一个 Shield Wallet，分别作为商家和付款人 |
| **B（单浏览器切换）** | 同一浏览器装一个钱包，支付时在扩展里切换账户（需要两个账户） |

> 若用方案 B：钱包需提前创建**两个账户**（一个当商家、一个当付款人）。

### 领取测试币

- 商家和付款人都需要一些 **Testnet credits**（测试币，无真实价值）
- 领取方式：
  - Aleo Testnet 水龙头（faucet），或
  - 若已有测试币，用 Explorer 的 credits.aleo `transfer_public` 转给另一个账户
- 建议每个账户 ≥ 2 credits（支付 0.5 + 手续费）

### 启动 Demo 网站

打开 Demo 地址（主办方提供的链接，通常是 `http://localhost:3002` 或部署后的公网地址）。

---

## 1. 商家创建发票（2 分钟）

1. 在商家钱包（浏览器 A / 账户 1）中，打开 Demo 首页 → 点 **「商家后台」**（或直接访问 `/merchant`）
2. 点「连接钱包」→ 在 Shield 弹窗中**授权**（允许连接 + 授权 `pay_private_v3.aleo` 和 `credits.aleo` 两个程序；v3 pay_invoice 内置 `credits.aleo::transfer_private`，付款人侧需准备 private credits record）
   > 若之前连接过但改了代码，先**断开再重连**以确保授权生效。
3. 点 **「铸造发票」** 进入 `/merchant/invoice`
4. 填写：
   - **金额**：`0.5`
   - **付款人地址**：粘贴**付款人钱包的地址**（从付款人钱包扩展里复制，形如 `aleo1...`）
5. 点 **「铸造并交付发票（单笔交易）」**，商家钱包会**弹窗一次**要求签名：
   - `mint_to_payer(merchant, payee, amount, invoice_id)` — 单笔交易把 InvoiceRecord
     的 owner 一步写为付款人地址（**无需**额外的 transfer_invoice，也**无需**
     中间等待钱包扫描记录）
   - 点「批准/执行」
6. 完成后页面出现 **Checkout 链接** 和 **「打开支付页 →」按钮**

**这一阶段你会看到**：一笔 `mint_to_payer` 交易在 Explorer 可查；发票已直接
归属付款人地址，付款人用自己钱包的 `requestRecords('pay_private_v3.aleo')`
即可扫描到。

---

## 2. 付款人支付（2–3 分钟）

1. 切换到**付款人钱包**（浏览器 B / 账户 2）
2. **重要：准备 ≥ 0.5 credits 的 private credits record**。v3 `pay_invoice`
   在合约内调用 `credits.aleo::transfer_private`，需要付款人提供一张
   private 的 credits record 作为 token。
   - 如果钱包里只有 **public** credits（默认状态），先用 `credits.aleo::transfer_public_to_private` 把 ≥ 0.5 credits 转成 private record
   - 余额 ≥ 支付金额即可（多余部分会自动找零）
   - 演示 demo 不会自动做这一步——付款人需要手动准备
3. 点第 1 步的 **「打开支付页 →」**（或复制 Checkout 链接在付款人浏览器打开）
4. 页面显示：应付金额 `0.5 credits`、商家地址、发票号
5. 点 **「支付 0.500000 credits」**，付款人钱包会**弹窗一次**，要求签名：
   - `pay_invoice(invoice, amount, sender_ciphertext, credits_token)` ——
     单笔交易原子完成 `credits.aleo::transfer_private`（把 ≥0.5 credits 转账给商家，
     多余余额找零）+ 消费 InvoiceRecord + 产出商家 `MerchantReceipt` +
     付款人 `PayerReceipt`（含 ZK 证明，首次较慢）
6. 确认后自动跳转到**支付状态页**，显示：
   - **「支付成功 ✓」** + 金额 `0.5`
   - 一笔交易 ID（`pay_invoice` 单笔交易）+ Explorer 链接

**这一阶段你会看到**：付款人钱包余额减少（private record 被花费 + 找零）、
商家钱包余额增加（真实资金流动）；状态页展示一笔链上交易（v3 原子结算：
transfer + 消费 + 双 Receipt 在同一交易内完成）。

> **安全设计**：v3 采用**单笔交易原子结算**——`transfer_private` 转移 credits、
> 消费 InvoiceRecord、产出双 Receipt 在同一笔交易内顺序执行；任一步失败
> （金额不匹配 / 余额不足 / 链上校验不过）整笔 revert，**杜绝任何中间态**。
> 付款人不会「先扣发票再付款」或「先付款但发票未消费」——两种风险同时消除。

---

## 支付流程设计说明（v3 原子结算）

Demo 当前部署在 **`pay_private_v3.aleo`**（v3 原子结算）。`pay_invoice`
在单笔交易内调用 `credits.aleo::transfer_private` 完成真实链上 token
转移，同时消费 InvoiceRecord（防重放）并产出双 Receipt：

- **商家侧**：`MerchantReceipt`（owner = 商家，携带 sender_ciphertext 审计锚点）
- **付款人侧**：`PayerReceipt`（owner = 付款人，合规备查、争议仲裁用）

| 维度 | v2（历史） | **v3（当前 Demo）** |
|------|-----------|-------------------|
| 真实 token 转移 | 链下 SDK 组合补足（两笔交易） | 合约内 `credits.aleo::transfer_private` |
| 原子性 | 多笔交易 | **单笔交易**（任一步失败整笔回滚） |
| Receipt 数量 | 仅 `PaymentRecord` | 商家 `MerchantReceipt` + 付款人 `PayerReceipt` |
| 依赖 | 无 | `credits.aleo`（network） |
| 防重放 | InvoiceRecord 消费语义 | 保留 |
| Sender Ciphertext | `group` 字段 | 保留 |

> v3 借助 Leo 4.4 引入的 network 依赖，把「隐私收单」与「真实 credits 转移」
> 合并为单笔交易，**消除 v2 的两笔交易中间态**——不再需要「先转账再消费发票」
> 的外部协调，付款人只需提供一张 ≥ 金额的 private credits record。

无论 v2 / v3，**Sender Ciphertext（group 字段）始终承载付款人公钥承诺**——
商家凭 View Key 解密还原付款人身份，链上仅暴露群元素承诺。

---

## 3. 商家后台确认收款（1 分钟）

1. 切回**商家钱包**，点状态页的 **「商家后台」**（或访问 `/merchant`）
2. 刷新页面：
   - **累计收款**显示 `0.5`
   - **最近交易**出现该发票：状态「已支付」、来源「链上」、付款人 = 付款人地址
3. 点 **「导出账期 (View Key)」** 进入 `/merchant/export`
   - 可导出 CSV / JSON 账单，含 `sender_ciphertext` 合规披露字段

**这一阶段你会看到**：商家后台完整展示这笔隐私收款的明细。

---

## 4. 想再试一次？（可选）

- 回到第 1 步，换一个金额（如 `0.3`）再走一遍
- 或尝试**失败路径**：
  - 让付款人余额不足 → 转账失败，发票不会被消费（页面给出明确错误）
  - 用同一 Checkout 链接支付两次 → 第二次被链上拒绝（发票已消费）

---

## 常见问题

| 问题 | 解决 |
|------|------|
| 支付时提示程序未授权 | 断开钱包重连，在授权弹窗中允许 `pay_private_v3.aleo` 和 `credits.aleo` |
| `pay_invoice` 报余额不足 | 付款人需要一张 ≥ 支付金额的 **private credits record**（v3 走 `transfer_private`，无 record 会失败）；用 `credits.aleo::transfer_public_to_private` 把 public credits 转 private，或重新领水 |
| 证明生成很慢 | 首次生成 ZK 证明需加载 WASM + 合成证明密钥，属正常现象；后续更快 |
| 状态页一直转圈 | 稍等链上确认；若超时可在页面手动粘贴 Explorer 中的交易 ID（`at1...`）重试 |
| 商家后台看不到记录 | 稍等钱包同步后刷新，或断开钱包重连 |

---

## 联调完成确认（评审核对清单）

- [ ] **单笔** `mint_to_payer` 交易在 Explorer Accepted（商家侧，发票 owner 直接为付款人）
- [ ] **单笔** `pay_invoice` 交易在 Explorer Accepted（v3 原子结算：内含 `credits.aleo::transfer_private` + 消费 InvoiceRecord + 产出 MerchantReceipt + PayerReceipt）
- [ ] 付款人余额减少、商家余额增加（真实资金流动）
- [ ] 状态页显示「支付成功 ✓」+ 实际金额 + 单笔交易 ID
- [ ] 商家后台可见收款明细（链上来源标注「链上」）+ View Key 账期导出
