# H5 手动联调步骤（ALEO-MVP-018 端到端真实交易）

> 由开发者在真实浏览器 + Shield Wallet 中执行。当前代码已补全真实链路
> （pay_private_v2.aleo 含 transfer_invoice），本清单串起
> 「商家铸造发票 → 转移 → 付款人支付 → 确认 → 商家后台可见」完整闭环。
> 遇到问题把报错抛回给 session 解决。

---

## 0. 前置准备

- [ ] 浏览器安装 **Shield Wallet** 扩展，切换到 **Testnet**
- [ ] 准备两个钱包账户（双账户测试）：
  - **商家钱包 A**（= pay_private_v2.aleo 部署者，已有测试币 26.85 credits）
    `aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69`
  - **付款人钱包 B**：新建账户，需有少量测试币（≥ 金额 + 手续费 ~0.1 credits）
    > 若 B 无测试币：用 A 在 Explorer 上向 B 转账（credits.aleo transfer_public）
- [ ] 启动 dev server：`cd frontend/demo && pnpm dev`（端口 3002）
- [ ] 确认 `.env` 含 `VITE_RPC_ENDPOINT=https://api.explorer.provable.com/v1`
  （已配置；若默认 api.testnet.aleo.org 不可达，这是关键覆盖）

---

## 1. 商家铸造发票并转移（钱包 A）

1. 打开 `http://localhost:3002/merchant`，连接**钱包 A**
2. 点「铸造发票」→ `/merchant/invoice`
3. 输入：
   - 金额：`0.5`（小额，留足手续费）
   - 付款人地址：**钱包 B 的地址**
4. 点「铸造并转移发票」，钱包 A 依次签名两笔交易：
   - `create_invoice`（铸发票）→ 等待扫描到 InvoiceRecord（~15s 内）
   - `transfer_invoice`（转移给 B）→ 完成
5. 页面出现 **Checkout 链接**（含 `invoice_record` 参数）——复制它

**验证点**：
- Explorer 可查两笔交易（页面显示 txId）
- 链接形如：
  `http://localhost:3002/pay/inv_demo_xxx?amount=0.500000&merchant=aleo1...&invoice_record=%7B%20owner...`

---

## 2. 付款人支付（钱包 B）

1. 换浏览器/隐身窗口连接**钱包 B**（或同浏览器切换钱包账户）
2. 打开第 1 步复制的 Checkout 链接
3. 页面应显示：
   - 金额 0.5 credits
   - Demo 模式提示「**已附带商家转移的 InvoiceRecord**」
4. 点「支付 0.500000 credits」，钱包 B 签名 `pay_invoice` 交易
   （含真实证明，证明耗时看机器性能）
5. 跳转 `/pay/:invoiceId/status` → 轮询确认（默认 60s 超时）

**验证点**：
- Status 页显示「支付成功 ✓」+ 金额 + Explorer 链接
- `verifyPayment` 通过 RPC（api.explorer.provable.com）确认链上交易
- Explorer 打开交易能看到 PaymentRecord 产出

---

## 3. 商家后台确认收款（钱包 A）

1. 回到钱包 A 的 `http://localhost:3002/merchant`
2. 刷新页面：
   - 累计收款应包含 0.5 credits
   - 最近交易表出现该发票（状态「已支付」，来源「链上」）
   - 付款人列显示钱包 B 地址
3. 打开 `/merchant/export` → 导出 CSV/JSON 账单
   - 含 `sender_ciphertext` 合规披露字段

---

## 4. 失败路径演练（可选，预演用）

| 场景 | 操作 | 预期 |
|------|------|------|
| 金额不符 | Checkout 链接改 `amount=1.0` 后支付 | pay_invoice 断言失败，状态页显示失败原因 |
| 重复支付 | 用同一链接再支付一次 | 记录已被消费，交易被拒 |
| RPC 降级 | 删掉 `VITE_RPC_ENDPOINT` 重启 dev | status 轮询失败（本环境默认端点不可达）→ 恢复配置 |

---

## 5. 性能埋点导出（018 验收 3）

- 支付过程中 Performance Panel 记录 `checkout-prove` / `checkout-broadcast` /
  `checkout-confirm` 三个阶段耗时
- 商家铸造页记录 `invoice-create` / `invoice-transfer`
- 用 Performance Panel 的「下载报告」导出，供 019 预演用

---

## 6. 联调完成确认

- [ ] 全链路真实交易（非 mock）在 Testnet 跑通
- [ ] 交易在 Explorer 可查，PaymentRecord 正确产出
- [ ] 商家后台见收款明细 + View Key 导出
- [ ] 性能埋点导出成功
