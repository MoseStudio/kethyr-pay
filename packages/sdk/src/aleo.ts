/**
 * Aleo WASM SDK 初始化封装。
 *
 * 照搬 POC `frontend/aleopay-demo/src/lib/aleo.ts` 的模式：
 * `initializeWasm()` + `initThreadPool(4)`，并用模块级标志保证幂等（重复调用不重复初始化）。
 */

import { Account, initThreadPool, initializeWasm } from '@provablehq/sdk/testnet.js'

let aleoReady = false

/**
 * 初始化 Aleo WASM SDK（幂等）：
 * - `initializeWasm()`：加载 wasm 运行时
 * - `initThreadPool(4)`：启动 4 线程的 proving 线程池
 *
 * 可在浏览器与 Node 环境调用（WASM 资源由使用方按宿主环境加载）。
 */
export async function initAleoSDK(): Promise<void> {
  if (aleoReady) return

  await initializeWasm()
  await initThreadPool(4)
  aleoReady = true
}

/** 重置幂等标志（主要用于测试） */
export function resetAleoSDK(): void {
  aleoReady = false
}

/** Aleo 账户三件套（字符串形式） */
export interface AleoAccount {
  address: string
  privateKey: string
  viewKey: string
}

/**
 * 创建新的 Aleo 账户。
 * 注意：需要 WASM 已初始化（先调用 initAleoSDK()）。
 */
export function createAccount(): AleoAccount {
  const account = new Account()

  return {
    address: account.address().to_string(),
    privateKey: account.privateKey().to_string(),
    viewKey: account.viewKey().to_string(),
  }
}
