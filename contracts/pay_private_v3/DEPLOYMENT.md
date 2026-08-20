# Deployment Log — pay_private_v3.aleo

## 状态

✅ 已部署到 Testnet（v3 原子结算合约，含 `mint_to_payer` / `create_invoice` /
`pay_invoice` / `transfer_invoice` / `query_invoice`）。

## 部署前置

- Leo CLI v4.4.1（snarkVM 4.9.0），与 v2 部署链对齐。
- 部署账户需持有 testnet credits（v2 历史部署约 6.73 credits，建议预留 ≥ 8 credits）。
- `.env` 中 `PRIVATE_KEY` 持有账户需可支付部署费。

## 部署命令

```bash
cd contracts/pay_private_v3
PRIVATE_KEY=APrivateKey1zkp... \
NETWORK=testnet \
ENDPOINT=https://api.explorer.provable.com/v1 \
bash scripts/deploy.sh
```

> 非交互式自动化场景（如 CI / agent）请直接调 `leo deploy --yes`：
> ```bash
> leo deploy --network testnet \
>            --endpoint https://api.explorer.provable.com/v1 \
>            --private-key "$PRIVATE_KEY" \
>            --broadcast --yes
> ```

## 部署后字段

| 字段 | 值 |
|-------|---|
| Network | testnet |
| Program ID | `pay_private_v3.aleo` |
| Deployer Address | `aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69` |
| Transaction ID | `at1sq0xgyaqsx53k9eqkgexzu2njjpt66p4c0jzh566taqe6yj9nufqzre8wy` |
| Fee Transaction ID | `at1f4w8p7p77rruw0fdv79dmax7fx5e0re54adxqcm9p6r5jds8lqyq3d4su8` |
| Endpoint | https://api.explorer.provable.com/v1 |
| Total Fee | 10.849479 credits |
| Confirmed Block | 18,875,651+（Confirmed） |
| Confirmed | ✅ |

## 函数签名

| 函数 | 签名 |
|------|------|
| `mint_to_payer` | `(merchant: address, payee: address, amount: u64, invoice_id: field) -> InvoiceRecord` |
| `create_invoice` | `(merchant: address, amount: u64, invoice_id: field) -> InvoiceRecord` |
| `pay_invoice` | `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group, token: credits.aleo::credits) -> (MerchantReceipt, PayerReceipt, credits.aleo::credits, credits.aleo::credits)` |
| `transfer_invoice` | `(invoice: InvoiceRecord, to: address) -> InvoiceRecord` |
| `query_invoice` | `(invoice: InvoiceRecord) -> (address, u64, field)` |

## Records

- **InvoiceRecord**: `owner`, `merchant`, `amount`, `invoice_id`, `serial_number`
- **MerchantReceipt**: `owner`, `merchant`, `sender`, `sender_ciphertext`, `amount`, `invoice_id`
- **PayerReceipt**: `owner`, `merchant`, `sender`, `sender_ciphertext`, `amount`, `invoice_id`

## ABI

构建产物：`build/pay_private_v3/abi.json`（`leo build` 自动生成）。

## Frontend Configuration

升级后，前端 SDK（`packages/sdk`）需将 `PROGRAM_ID` 切换为
`'pay_private_v3.aleo'`，并把 `pay_invoice` 调用适配新的四参签名 + 多
返回值。
