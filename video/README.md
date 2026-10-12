# KethyrPay — Pitch video (Remotion)

Colosseum 的表单要求一段 **≤2 分钟**的 pitch video：「介绍你们是谁 / 在做什么 / 为什么是你们来做」，
并明确说 *"Nothing fancy required — we're interested in how you think and communicate."*

所以这版是**「动画 + 你的真人旁白」**：画面（本 Remotion 工程）负责把逻辑讲清楚，
**人声由你自己录**并叠上来。纯动画没有声音会明显吃亏 —— 那正是评委想听的部分。

- 画布：1920×1080 · 30fps · **110 秒**（留足余量，不超 2 分钟）
- 结构：Intro 10s → Problem 22s → Product 34s → Why us 26s → Roadmap 12s → Close 6s
- 时间轴集中在 `src/shared/theme.ts` 的 `TIMELINE`；文案都在 `src/scenes.tsx`，改字不用碰动画代码

## 渲染

```bash
cd video
pnpm install

# 1) 先渲一版无声的看效果
pnpm render                       # → out/kethyrpay-pitch.mp4

# 2) 录制旁白（脚本见下），存成 public/voiceover.mp3，再渲带人声的版本
pnpm render:vo                    # → out/kethyrpay-pitch.mp4（含旁白）

# 3) 想在片头带上名字
npx remotion render KethyrPitch out/kethyrpay-pitch.mp4 --props='{"presenter":"你的名字"}'
```

用 `pnpm dev` 打开 Remotion Studio 可以逐帧预览、改文案即时看到效果。

> 首次渲染会自动下载 Remotion 自带的 Chrome Headless Shell（约 100 MB），之后复用。
> 如果机器上已有 Chromium，也可以跳过下载：
> `npx remotion render KethyrPitch out/pitch.mp4 --browser-executable=/path/to/chrome`

### 慢机器上的渲染参数

纯 CPU 软件光栅化时 1080p 很慢（本机 4 核实测约 1 秒/帧 ≈ 55 分钟）。这套参数把 110 秒的片子压到 ~35 分钟：

```bash
npx remotion bundle                        # 先出一次 bundle，后续渲染复用（省掉每次打包的 ~40s）
npx remotion render KethyrPitch out/kethyrpay-pitch.mp4 \
  --bundle=build --scale=0.75 --concurrency=4 --jpeg-quality=70
```

- `--scale=0.75` → 输出 **1440×810**（1920×0.75、1080×0.75 都是整数，Remotion 不接受小数尺寸）
- `--concurrency` 不能超过 CPU 核数，否则报错
- 画面用的渐变刻意做得很「便宜」：无 GPU 环境下，全屏多层径向渐变 + CSS mask 会让每帧成本翻好几倍

## 旁白脚本（照着念，时间轴对齐画面）

> 语速按 ~2.5 词/秒估的；每段都标了预算，超了就删字，别加速。

| 时间 | 画面 | 旁白（英文） |
|---|---|---|
| 0:00–0:10 | 品牌 + 标语 | *Hi, I'm **\[你的名字\]**. I build on Solana — and I want to talk about something that hasn't changed in a century: how people get paid.* |
| 0:10–0:32 | 三个问题卡片 | *Payroll is still a monthly batch job. You do the work in week one; the money arrives in week four. For cross-border teams that wait is measured in days. And withholding — the tax you're required to hold back — lives in a spreadsheet, disconnected from the payment it belongs to. Three problems, one root cause: settlement is scheduled, not continuous.* |
| 0:32–1:06 | 机制三卡 + 公式 | *So we built KethyrPay — payroll as a continuously-accruing claim on Solana. The employer funds a stream once; the principal sits in a vault the program owns. From then on the balance isn't transferred, it's **computed**: total times elapsed over duration. The employee withdraws whenever they want, down to the second. On claim we split it in the same instruction — net pay to the employee, withholding to the company tax vault: both transfers, or neither. And nothing is sent per second: a stream costs the same whether it runs an hour or a year.* |
| 1:06–1:32 | 交付清单 | *Why us? Because we shipped the whole thing, not a deck. The Anchor program is six instructions and two PDAs. The client is an employer console and an employee portal, both live on devnet right now. And we wrote tests that assert the properties we actually care about: withheld tax equals the rate, net plus tax equals the claim, and the vault drains to zero.* |
| 1:32–1:44 | Roadmap | *Next: compliant privacy. Amounts as Token-2022 confidential transfers, decryptable by a company auditor — private from competitors, transparent to tax. Then hide the schedule itself. Then mainnet.* |
| 1:44–1:50 | 收尾 CTA | *It's live on devnet. The link is on screen — go break it.* |

## 录制建议

- **手机录音就够**。找个安静房间，别用系统 TTS —— 评委在听「你怎么表达」。
- 先看着表把 6 段各录一遍，再拼起来；比一口气念 110 秒稳。
- 录完丢进 `public/voiceover.mp3`，`pnpm render:vo` 一次成型。
- 想更保险：直接用手机拍一段"人影 + 这版动画画中画"，那就同时满足「有人」和「有产品」。

## 文件结构

```text
video/
├── remotion.config.ts
├── src/
│   ├── index.ts            # registerRoot
│   ├── Root.tsx            # Composition（1920x1080 / 30fps / 110s）
│   ├── KethyrPitch.tsx     # 时间轴：拼接各个场景 + 进度条 + 可选旁白
│   ├── scenes.tsx          # 六个场景的全部文案与排版
│   └── shared/
│       ├── theme.ts        # 配色 / 字体 / TIMELINE
│       └── ui.tsx          # Background / Scene / 文本与卡片原子 / 盾牌标
└── public/                 # 放 voiceover.mp3（见其中 README）
```
