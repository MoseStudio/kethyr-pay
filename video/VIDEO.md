# kethyrpay · 视频脚本

> KethyrPay 宣传片 — "Stripe-like 隐私支付网关 on Aleo"。L4 面板序列。
> 先写剧本再动代码：每幕秒级时长，用 timing-plan.mjs 换算成帧表写进 src/kethyrpay/timings.ts。

## 逐帧大纲

| # | 秒 | 画面 | 文案/代码 | 备注 |
|---|----|------|-----------|------|
| 1 | 0-3.5 | Intro：终端打字 | `npm i @kethyrpay/sdk` | 版本徽标 v0.3 (pay_private_v3) + tagline |
| 2 | 3.5-15 | 支付流程：代码窗口逐行打字 → 右侧流程状态机（mint_to_payer → pay_invoice atomic） | SDK `createPayment()` / `verifyPayment()` / `mintInvoiceToPayer` | 真实资金流 + 浏览器端 ZK · 单笔原子 |
| 3 | 15-23 | 隐私面板：链上 InvoiceRecord/MerchantReceipt 只含密文 | `sender_ciphertext: group` 加密字段 · `pay_private_v3.aleo` | ALEO 计价，View Key 解密 |
| 4 | 23-31 | 合规面板：View Key 导出账期 CSV/JSON | 商户用 View Key 解密 · ALEO | 可审计、非混币 · 币种 ALEO/USDC |
| 5 | 31-38 | 订阅面板：Escrow 授权 → 周期自动扣款 → 取消退款 | `authorize_subscription` | 隐私链上无静默扣款 |
| 6 | 38-41 | Outro：品牌 + 标语 | "Privacy-first payments on Aleo." | pay_private_v3 徽标 |

## 素材清单
- 背景图: public/background-3.jpg（复用 files-sdk 深色背景）
- 字体: Geist + GeistMono（@remotion/google-fonts）
- 声音: 无（可加 typing 音效，见 launch/typing-sounds.tsx）
- 代码: 来自 packages/sdk 真实 API（createPayment / verifyPayment / mintInvoiceToPayer / paymentIdToField），币种 `ALEO`（为 USDC 扩展留位）
- 合约: `pay_private_v3.aleo`（当前 Testnet 部署，原子结算）

## 排期表（timing-plan.mjs 生成后回填）
| 场景 | from | duration | 说明 |
|------|------|----------|------|
| intro | 0 | 105 | |
| payflow | 105 | 345 | 代码打字 + 状态机（v3 原子 3 步） |
| privacy | 450 | 240 | InvoiceRecord / ALEO |
| compliance | 690 | 240 | View Key · ALEO |
| subscription | 930 | 210 | |
| outro | 1140 | 75 | |
| 总长 | | 1215 | ≈40.5s @30fps |

## 渲染记录
- [ ] pnpm types 通过
- [ ] Studio 逐帧检查，console 0 error
- [ ] pnpm remotion render Kethyrpay 输出 out/Kethyrpay.mp4
- 渲染不了的点（如实记）:
