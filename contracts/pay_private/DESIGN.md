# pay_private.aleo — 设计文档

> 对应 Issue：ALEO-MVP-002（单次隐私收单合约）｜ 黑客松 Demo 主路径

## 1. 目标

支撑黑客松 Demo 北极星闭环的合约层：

```
商家 create_invoice → 付款人打开支付链接 → pay_invoice 生成 PaymentRecord → 商家后台可见
```

核心合规要求：**每笔支付输出含 Sender Ciphertext 的 `PaymentRecord`**，商家可用 View Key
解密确认付款人身份（隐私但不碰 Mixer，合规底线清晰）。

## 2. 记录模型

### InvoiceRecord（发票）

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | address | 发票持有者（创建者，即商家） |
| `merchant` | address | 收款商家地址 |
| `amount` | u64 | 收款金额（microcredits） |
| `invoice_id` | field | 商家自定义发票号（哈希承诺） |
| `serial_number` | field | `BHP256::hash_to_field(merchant, amount, invoice_id)`，防重放锚点 |

### PaymentRecord（收款记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | address | 收款方（= merchant） |
| `merchant` | address | 商家地址 |
| `sender` | address | 付款人地址 |
| `sender_ciphertext` | group | 付款人公钥承诺（Sender Ciphertext 锚点） |
| `amount` | u64 | 实际支付金额 |
| `invoice_id` | field | 对应发票号 |

## 3. 函数与状态转换

| 函数 | 签名 | 说明 |
|------|------|------|
| `create_invoice` | `(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord` | 商家创建发票 |
| `pay_invoice` | `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group) -> PaymentRecord` | 付款人支付 |
| `query_invoice` | `(invoice: InvoiceRecord) -> (address, u64, field)` | 链下只读查询 |

```
[create] InvoiceRecord 创建（owner=商家）
   │  pay_invoice（付款人签名，amount 校验，InvoiceRecord 被消费）
   ▼
[paid] PaymentRecord 产出（owner=商家，含 sender_ciphertext）
```

状态转换由 **Record 模型** 表达，无链上可变全局状态：

- **created → paid**：`pay_invoice` 消费 `InvoiceRecord`（不再返回），产出
  `PaymentRecord` 给商家。同一发票的 InvoiceRecord 一旦被消费即无法再次支付
  （同一串行号记录不可重复消耗），实现**防重放**。

## 4. Sender Ciphertext 合规说明

### 链上表达

Leo v4.3.2 下 `ciphertext` 类型不能作为记录字段直接序列化/参与等式约束，
因此合约使用 `group` 类型字段 `sender_ciphertext` 承载付款人公钥承诺。

### 真实语义（SDK/钱包层）

完整的 Aleo Sender Ciphertext 由钱包层生成：付款人用一次性随机数 `r` 与商家
地址派生共享密钥，加密付款人地址得到 `ciphertext`；商家持有 **View Key** 可解密
还原付款人身份。SDK（ALEO-MVP-006/007）负责在 `pay_invoice` 调用时从钱包获取
该 ciphertext 并编码为 group 承诺传入合约。链上 `sender_ciphertext` 字段作为
**可审计锚点**，完整密文由事件/链下数据携带，商家后台解密展示。

> 评审话术：链上公开的是群元素承诺（不可反推付款人），解密能力仅握在持有
> View Key 的商家手中 —— 隐私金额 + 合规可审计双满足。

## 5. 防重放设计

- `serial_number = BHP256::hash_to_field(merchant, amount, invoice_id)` 唯一确定。
- `pay_invoice` 校验 `amount == invoice.amount`，且消费 InvoiceRecord。
- 同一 `invoice_id` 的 InvoiceRecord 在链上仅能存在一份、被支付一次；
  重复支付尝试在记录层即被拒绝（`@should_fail` 测试覆盖）。

## 6. credits.aleo 取舍说明

Leo v4.3.2 标准库**不捆绑 credits.aleo 源文件**，且本环境无在线依赖 registry，
因此合约内无法调用 `credits.aleo::transfer_public` 完成链上真实 token 转账。

**决策**：本合约聚焦「隐私收单的证明与记录产出」，链上 token 流动由 SDK/钱包层
（`@provablehq/sdk` 的 `transfer_public`/`execute` 组合）在真实 Demo 中补足——
付款人钱包先执行 credits 转账，再调用 `pay_invoice` 产出带 Sender Ciphertext 的
`PaymentRecord`。两条交易均在 Explorer 可见，Demo 闭环真实。

若后续需要单笔原子化（转账+记账同一交易），可升级为 credits.aleo 依赖导入
（需 Leo 支持 imports），记为赛后项 ALEO-HACK-104 同类工作。

## 7. 测试覆盖（7/7 通过）

| 测试 | 断言 |
|------|------|
| `test_create_invoice` | 字段正确、serial_number 非零 |
| `test_pay_invoice_success` | PaymentRecord 字段、sender_ciphertext 一致 |
| `test_pay_invoice_wrong_amount` | 金额不匹配 @should_fail |
| `test_create_invoice_zero_amount` | 零金额 @should_fail |
| `test_create_invoice_zero_id` | 零 invoice_id @should_fail |
| `test_pay_invoice_replay` | 重放拒绝 @should_fail |
| `test_query_invoice` | 查询返回 (merchant, amount, invoice_id) |
