# Kethyr Flow — Devnet 路演/评测指南

面向**观众与评委**：用浏览器 + Phantom 钱包，在 devnet 上亲手跑一遍「流式薪酬」。

> 线上地址：`https://kethyrpay.suseayah.workers.dev`（雇主页 `/payroll`，员工门户 `/payroll/employee`）

---

## 0. 先准备（1 分钟）

1. 安装 **Phantom** 浏览器扩展。
2. Phantom → 设置(齿轮) → **Developer Settings → Change Network → Devnet**（顶栏显示 Devnet）。
3. **演示钱包**：为了省去现场领水龙头（devnet faucet 常被限流），我们预置了两个已充值的钱包：

   | 角色 | 地址 |
   |---|---|
   | Employer（老板） | `3chkcRAik9Gj34ZHJcEDfbVeSaRrB2LG3oGySABNCVTy` |
   | Employee（员工） | `B4E9pHZnhyLe5PTqnK3KX9i7YEyWvMKwt2PooXqMr5pp` |

   私钥**不放在公开仓库里**（会被盗刷）。现场请扫摊位二维码 / 向工作人员索取，
   或在 Phantom 里用「Import Private Key」导入这两个钱包。

   > 也可以完全用你自己的钱包：去 https://faucet.solana.com 领 >0.1 SOL，再按第 3 步让老板给你开流（需要一个已存在的 mint，见下方「测试代币」）。

4. Phantom 里 **Import token**，填入 mint：
   `FZajpoDvjLbpdeK2CvcdGmg1wGqcWrVYqvYC2thFcp8m`
   即可看到 Employer 的 `100000` 测试代币。

---

## 1. 观众路线：3 分钟跑完「开流 → 跳动 → 提现 → 结算」

用 **Employer** 钱包：

1. 打开线上地址的 **`/payroll`**（Employer Console）。
2. 首次进入若显示 `Initialize company (first time)`：mint 已预填，税率保持 `1500`（=15%），点 **Initialize company** → Phantom 确认。
3. 在 **Create a new stream** 填：
   - Employee wallet address: `B4E9pHZnhyLe5PTqnK3KX9i7YEyWvMKwt2PooXqMr5pp`
   - Total amount (tokens): `100`
   - Start time: 现在；End time: **60 秒后**（改成 1 分钟后最容易看到跳动）
   - Withholding rate: `1500`
   点 **Create stream & fund** → Phantom 确认。
4. 页面出现该流卡片：状态 `Streaming`，「已解锁」数字**逐位滚动**上涨，每秒约 `1.67` 代币。

切到 **Employee** 钱包：

5. 打开 **`/payroll/employee`**（Employee Payroll Portal）。
6. 看到水表在跳 → 点 **Claim** → Phantom 确认。
7. 链上会原子分流：净额进员工钱包、预扣税进企业税务金库（正好是 15%）。
   页面上会显示 `Claim succeeded: <签名>…`。

回到 **Employer** 钱包：

8. 在 `/payroll` 点 **Terminate & settle**（在结束时间之前）：
   - 已工作部分的额度立即结清给员工（扣税）
   - 未解锁的余额退回雇主
   - 卡片变为 `Terminated`，可再点 **Close account (reclaim rent)** 回收租金。

**可以验证的数字（60 秒 / 100 币 / 15% 这套）**
- 每秒解锁 `100 / 60 ≈ 1.6667`
- 第 30 秒：已解锁 `50`，净额 `42.5`、代扣税 `7.5`
- 任意时刻都有：`员工净额 + 代扣税 == 已提取总额`，且**永不超发**

---

## 2. 链上信息（可自行核对）

| 项 | 值 |
|---|---|
| Program | `Afm1YLnn7WBqbGgBvtxt8GMdV4LbogNqkhbtErXouP4v` |
| 测试代币 mint | `FZajpoDvjLbpdeK2CvcdGmg1wGqcWrVYqvYC2thFcp8m`（6 位小数） |
| Explorer | `https://explorer.solana.com/address/<地址>?cluster=devnet` |
| RPC | `https://api.devnet.solana.com` |

```bash
# 查演示钱包的代币余额（把 <owner> 换成上面任一地址）
spl-token balance FZajpoDvjLbpdeK2CvcdGmg1wGqcWrVYqvYC2thFcp8m --owner <owner> --url devnet
```

---

## 3. 主办方/工作人员：重新准备演示环境

```bash
# 需要 CLI 钱包有 devnet SOL（领水：https://faucet.solana.com）
sh scripts/devnet-setup.sh          # 幂等：部署程序 + 建 mint + 充值 + 铸币
```

演示前 5 分钟建议手动刷新一次余额（防止被人刷掉）：

```bash
sh scripts/devnet-setup.sh 100000
```

---

## 4. 常见问题

- **路演前公司已初始化过，评委看不到 Initialize?**
  正常 —— 公司是**按老板地址**派生的，同一个 Employer 钱包只会初始化一次；直接跳到第 3 步开流即可。
- **Claim 报 `NothingToClaim`**：链上按整秒结算，且当前可提取为 0。等一会儿再点（页面上「可提取」为 0 时按钮本来就是禁用态）。
- **Phantom 里没有代币**：需要手动 Import token（第 0 步第 4 条）。
- **交易失败 / 余额为 0**：demo 钱包的 SOL 可能被消耗完了，跑一次 `scripts/devnet-setup.sh` 补。
- **页面一直显示 “Loading Solana wallet…”**：Phantom 未安装或未解锁，刷新重试。
- **这是 Solana 的 Devnet**，代币没有价值；Aleo 侧的 checkout 演示是另一条链路（需要 Shield 钱包 + Aleo Testnet），与薪酬模块互不影响。
