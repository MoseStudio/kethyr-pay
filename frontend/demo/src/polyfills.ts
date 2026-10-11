/**
 * 浏览器端 Node 全局垫片。
 *
 * 为什么需要：`@solana/web3.js` / `@solana/spl-token` / `@coral-xyz/anchor`
 * 的依赖链在模块求值时引用 Node 的全局 `Buffer`（以及少见的 `global`）。
 * 浏览器与 Vite 默认都不提供，因此会出现 `ReferenceError: Buffer is not defined`。
 *
 * 关键：本模块必须在任何 Solana 模块**求值之前**执行，故由 `src/router.tsx`
 * 作为第一个 import 引入（router.tsx 先于 routeTree，因而先于所有路由/组件）。
 */

import { Buffer as NodeBuffer } from 'buffer'

interface PolyfillGlobals {
  Buffer?: typeof NodeBuffer
  global?: typeof globalThis
}

const globals = globalThis as unknown as PolyfillGlobals

if (!globals.Buffer) {
  globals.Buffer = NodeBuffer
}

if (!globals.global) {
  globals.global = globalThis
}
