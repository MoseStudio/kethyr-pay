# WASM 多线程Headers 配置说明

## 背景

AleoPay POC 使用 `@provablehq/sdk` 在浏览器端生成零知识证明。该 SDK 的 WASM Prover 依赖 `SharedArrayBuffer` 实现多线程加速，而 `SharedArrayBuffer` 要求页面必须启用以下两个安全 Headers：

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

否则浏览器会抛出 `SharedArrayBuffer is not defined` 或类似错误，导致证明生成失败或回退到单线程（性能大幅下降）。

## 实现方式

TanStack Start 通过全局 `requestMiddleware` 注入 Headers。相关文件：

### 1. `src/start.ts`

定义全局中间件，在所有响应中添加 COOP/COEP Headers：

```typescript
import { createMiddleware, createStart } from '@tanstack/react-start'

const wasmHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  const headers = new Headers(result.response.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [wasmHeadersMiddleware],
}))
```

### 2. `vite.config.ts`

无需额外 Nitro 插件。`tanstackStart()` 插件会自动识别 `src/start.ts` 中的全局中间件配置。

### 3. `package.json`

开发服务器默认端口从 3000 改为 3002，避免与本地其他服务冲突：

```json
{
  "scripts": {
    "dev": "vite dev --port 3002"
  }
}
```

## 验证方法

### 开发环境

```bash
pnpm dev
curl -I http://localhost:3002/
```

### 生产环境

```bash
pnpm build
PORT=3003 pnpm start
curl -I http://localhost:3003/
```

期望输出：

```http
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
```

## 注意事项

1. **外部资源**：启用 `COEP: require-corp` 后，所有跨域资源（图片、字体、脚本、iframe）必须带有 `Cross-Origin-Resource-Policy` Header，或使用 `crossorigin="anonymous"` 加载。否则浏览器会阻止加载。
2. **第三方服务**：如果接入 Google Fonts、CDN 统计脚本等，需确认其支持 CORP，或改为同域托管。
3. **开发体验**：启用 COOP 后，浏览器窗口的跨域 `window.open` 引用会被隔离，通常不影响支付 Demo，但调试时需注意。
4. **后续优化**：可考虑仅对需要 WASM 证明生成的路由添加 Headers，而非全局添加，以减少对外部资源的影响。当前 POC 阶段采用全局方案以降低复杂度。
