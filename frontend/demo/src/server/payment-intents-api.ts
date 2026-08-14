/**
 * 发票系统 API — TanStack Start server functions（ALEO-MVP-012）。
 *
 * 本文件是 `POST /api/payment-intents` 与 `GET /api/payment-intents/:id` 两个端点的
 * server fn 包装层。端点逻辑在 `payment-intents-handlers.ts`（纯函数，可单测），
 * 本文件仅做 `createServerFn` 薄包装。
 *
 * 路由 → server fn 映射（语义等价于 REST 端点）：
 * - `POST /api/payment-intents`            → `createPaymentIntent(input)`（method: 'POST'）
 * - `GET  /api/payment-intents/:id`        → `getPaymentIntent(invoiceId)`（method: 'GET'，data 走 ?payload=）
 * - `POST /api/payment-intents/:id/expire` → `expirePaymentIntent(invoiceId)`（method: 'POST'，过期清理辅助）
 *
 * 说明：当前 @tanstack/react-start 1.168.x 尚未提供文件式 server routes，
 * `createServerFn` 是官方机制（client 调用即为 RPC，语义等价于 REST 端点）。
 * 注意：本文件**不带 .server 后缀**——client 组件需要 import 这些 server fn
 * 触发 RPC bridge，而 TanStack Start 的 import-protection 会禁止 client import
 * 所有 .server.* 文件（会被 mock 掉，见 vite 转换后的 client 模块）。
 */

import { createServerFn } from '@tanstack/react-start'

import {
  handleCreatePaymentIntent,
  handleExpirePaymentIntent,
  handleGetPaymentIntent,
  handleListPaymentIntents,
} from './payment-intents-handlers.js'

export {
  resetPaymentIntentStore,
  setPaymentIntentStore,
} from './payment-intents-handlers.js'

export const createPaymentIntent = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: unknown }): Promise<Response> => handleCreatePaymentIntent(data),
)

export const getPaymentIntent = createServerFn({ method: 'GET' }).handler(
  async ({ data }: { data: unknown }): Promise<Response> => handleGetPaymentIntent(data),
)

export const expirePaymentIntent = createServerFn({ method: 'POST' }).handler(
  async ({ data }: { data: unknown }): Promise<Response> => handleExpirePaymentIntent(data),
)

/** GET /api/payment-intents?merchant=xxx — 按商家列出（ALEO-MVP-015 商家后台数据源） */
export const listPaymentIntents = createServerFn({ method: 'GET' })
  .validator((input: unknown) => input as { merchant: string })
  .handler(
    async ({ data }: { data: { merchant: string } }): Promise<Response> =>
      handleListPaymentIntents({ data }),
  )
