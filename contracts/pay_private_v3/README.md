# pay_private_v3.aleo

KethyrPay 单次隐私收单合约 v3 — 在 `pay_private_v2.aleo` 基础上升级为
**单笔交易原子化**完成「credits 转账 + 发票消费 + 双 Receipt 产出」。

## 升级要点（相对 v2）

| 维度 | v2 | v3 |
|------|----|----|
| 真实 token 转移 | 链下 SDK 组合补足 | 合约内 `credits.aleo::transfer_private` |
| 原子性 | 多笔交易 | **单笔交易**（任一步失败整笔回滚） |
| Receipt 数量 | 仅商家 PaymentRecord | 商家 `MerchantReceipt` + 付款人 `PayerReceipt` |
| 依赖 | 无 | `credits.aleo`（network） |
| 防重放 | InvoiceRecord 消费语义 | 保留 v2 设计 |
| Sender Ciphertext | group 字段 | 保留 v2 设计 |

## 函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `mint_to_payer` | `(merchant: address, payee: address, amount: u64, invoice_id: field) -> InvoiceRecord` | 商家一步铸造发票并直接交付付款人（owner=payee） |
| `create_invoice` | `(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord` | 商家创建一次性收款发票（owner=signer；保留兼容路径） |
| `pay_invoice` | `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group, token: credits.aleo::credits) -> (MerchantReceipt, PayerReceipt, credits.aleo::credits, credits.aleo::credits)` | **原子化支付** |
| `transfer_invoice` | `(invoice: InvoiceRecord, to: address) -> InvoiceRecord` | 商家把发票转移给付款人（保留兼容路径） |
| `query_invoice` | `(invoice: InvoiceRecord) -> (address, u64, field)` | 链下只读查询 |

详见 [DESIGN.md](./DESIGN.md)。
