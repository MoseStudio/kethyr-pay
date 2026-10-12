# voiceover 放这里

把你自己录的旁白音频命名为 **`voiceover.mp3`** 放进本目录，然后渲染：

```bash
cd video
pnpm render:vo        # 等价于 remotion render … --props='{"voiceoverFile":"voiceover.mp3"}'
```

不放进来的话，`pnpm render` 会渲染**无声版**（画面字幕本身已承载全部信息，可以先用它看效果）。

支持 mp3 / wav / m4a 等。用手机录就行 —— 评委明确说「不看炫技，想看你怎么思考、怎么表达」，
所以**有人声的版本一定比纯动画得分高**。
