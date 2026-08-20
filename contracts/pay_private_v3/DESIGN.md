# pay_private_v3.aleo — 设计文档

> 在 v2 基础上把「隐私收单」升级为「**单笔交易原子化收单**」。
> 解决 v2 留下的 ALEO-HACK-104 同类工作项（DESIGN.md §6）。

## 1. 动机

v2 的 `pay_invoice` 仅产出 `PaymentRecord`，链上真实 token 流动需依赖 SDK
组合补足：付款人钱包先 `transfer_public` 转账，再调用 `pay_invoice`。这是
**两笔交易**，存在以下风险：

- 任一笔失败，另一笔已生效 → 资产状态不一致；
- 重放窗口：转账已落账但 `pay_invoice` 未上链，链下逻辑需自行兜底；
- 商家后台对账需 join 两笔 tx，不直观。

v3 把两步合并为一笔 Aleo 交易，借助 `credits.aleo::transfer_private` 与
InvoiceRecord 消费语义，**任一步失败即整笔回滚**。

## 2. 原子化路径

```
�──────────────────────────────────────────────────────────────┐
│ pay_invoice(invoice, amount, sender_ciphertext, token)        │
│                                                              │
│  ① assert_eq(invoice.amount, amount)         金额校验        │
│  ② credits.aleo::transfer_private(token, merchant, amount)   │
│       → (change, merchant_credits_record)   真实转账         │
│  ③ InvoiceRecord 被消费（不再返回）           防重放          │
│  ④ MerchantReceipt → owner = merchant                         │
│     PayerReceipt    → owner = signer                          │
│                                                              │
│  任一失败 → 整笔交易 revert，无副作用                         │
└──────────────────────────────────────────────────────────────┘
```

## 3. 记录模型

### InvoiceRecord（同 v2）

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | address | 发票持有者（创建者，即商家） |
| `merchant` | address | 收款商家地址 |
| `amount` | u64 | 收款金额（microcredits） |
| `invoice_id` | field | 商家自定义发票号 |
| `serial_number` | field | `BHP256::hash_to_field(merchant, amount, invoice_id)` 防重放锚点 |

### MerchantReceipt（v3 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | address | 收款方 = merchant |
| `merchant` | address | 商家地址 |
| `sender` | address | 付款人地址 |
| `sender_ciphertext` | group | 付款人公钥承诺（审计锚点） |
| `amount` | u64 | 实际支付金额 |
| `invoice_id` | field | 对应发票号 |

### PayerReceipt（v3 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | address | 付款人地址 |
| `merchant` | address | 商家地址 |
| `sender` | address | 付款人地址 |
| `sender_ciphertext` | group | 付款人公钥承诺 |
| `amount` | u64 | 实际支付金额 |
| `invoice_id` | field | 对应发票号 |

> 双 Receipt 设计：商家 Receipt 走对账/合规；付款人 Receipt 作为争议仲裁
> 与自身流水证据。

## 4. Sender Ciphertext 合规

同 v2：`group` 字段承载付款人公钥承诺，完整 ciphertext 由钱包层生成，商家
凭 View Key 解密还原付款人身份。链上仅暴露群元素承诺，不可反推。

## 5. 防重放

- `serial_number = BHP256::hash_to_field(merchant, amount, invoice_id)`。
- `pay_invoice` 消费 InvoiceRecord（不返回），同一发票只能成功支付一次。

## 6. 与 v2 的兼容性 / mint_to_payer 扩展

- 函数名 `create_invoice` / `pay_invoice` / `transfer_invoice` / `query_invoice` 保持一致；
- 新增 `mint_to_payer(merchant, payee, amount, invoice_id)`：单笔交易把
  `InvoiceRecord.owner` 直接写为 `payee`，省去 `create_invoice` →
  `transfer_invoice` 的两笔交易 + 中间等待钱包扫描的环节。`mint_to_payer`
  派生的 `serial_number` 与同参 `create_invoice` 完全一致（同样种子同样
  哈希），防重放语义不变；
- `pay_invoice` 新增第四个参数 `token: credits.aleo::credits`，调用方需
  在钱包侧准备好对应金额的 private credits record；
- 返回类型由单 `PaymentRecord` 变为 `(MerchantReceipt, PayerReceipt,
  credits.aleo::credits, credits.aleo::credits)` —— SDK 需更新适配；
- 程序 ID 由 `pay_private_v2.aleo` 升级为 `pay_private_v3.aleo`，建议
  部署为新程序而非升级旧程序（避免历史 PaymentRecord 兼容性陷阱）；
- 历史 `create_invoice` + `transfer_invoice` 两笔路径**保留**（不删），
  以兼容历史调用方；新代码统一切到 `mint_to_payer`。

## 7. 测试覆盖

- 继承 v2 全部 7 个断言：
  - `test_create_invoice` 字段正确、serial_number 非零
  - `test_create_invoice_zero_amount` @should_fail
  - `test_create_invoice_zero_id` @should_fail
  - `test_transfer_invoice` 字段转移
  - `test_query_invoice` 只读返回
  - `test_pay_invoice_wrong_amount` 金额不匹配 @should_fail
  - `test_pay_invoice_replay` 重放拒绝 @should_fail
- `mint_to_payer` 4 个新增断言：
  - `test_mint_to_payer` 字段正确、owner=payee
  - `test_mint_serial_matches` 同参 serial_number 与 create_invoice 一致
  - `test_mint_zero_amount` @should_fail
  - `test_mint_zero_id` @should_fail
- `pay_invoice` 成功路径依赖真实 credits record 注入，由 SDK 集成测试
  在 `packages/sdk` 端覆盖；CI 仅保证合约编译 + 单元测试通过。

## 8. 部署

```bash
cd contracts/pay_private_v3
PRIVATE_KEY=APrivateKey1zkp... bash scripts/deploy.sh
```

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。
