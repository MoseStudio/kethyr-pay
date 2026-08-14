import { describe, expect, it, vi } from 'vitest'

import { resetAleoSDK } from '../src/aleo.js'

// 在导入 src/aleo.ts 之前，把 @provablehq/sdk/testnet.js 的 WASM 相关模块替换为
// 纯逻辑 stub —— 测试不加载真实 WASM（约 30MB 且需要浏览器线程池）。
vi.mock('@provablehq/sdk/testnet.js', () => ({
  initializeWasm: vi.fn(async () => undefined),
  initThreadPool: vi.fn(async () => undefined),
  Account: class {
    address() {
      return { to_string: () => 'aleo1' + 'a'.repeat(58) }
    }
    privateKey() {
      return { to_string: () => 'privateKeyMock' }
    }
    viewKey() {
      return { to_string: () => 'viewKeyMock' }
    }
  },
}))

import { initAleoSDK, createAccount } from '../src/aleo.js'
import { initializeWasm, initThreadPool } from '@provablehq/sdk/testnet.js'

describe('initAleoSDK（幂等性，WASM 已 mock）', () => {
  beforeEach(() => {
    resetAleoSDK()
    vi.clearAllMocks()
  })

  it('初始化后 WASM 与线程池各被调用一次', async () => {
    await initAleoSDK()
    expect(initializeWasm).toHaveBeenCalledTimes(1)
    expect(initThreadPool).toHaveBeenCalledTimes(1)
    expect(initThreadPool).toHaveBeenCalledWith(4)
  })

  it('重复调用是幂等的（不重复初始化）', async () => {
    await initAleoSDK()
    await initAleoSDK()
    await initAleoSDK()
    expect(initializeWasm).toHaveBeenCalledTimes(1)
    expect(initThreadPool).toHaveBeenCalledTimes(1)
  })

  it('resetAleoSDK 后重新初始化会再次执行', async () => {
    await initAleoSDK()
    resetAleoSDK()
    await initAleoSDK()
    expect(initializeWasm).toHaveBeenCalledTimes(2)
  })

  it('createAccount 返回三件套', () => {
    const account = createAccount()
    expect(account.address).toMatch(/^aleo1[a-z0-9]{58}$/)
    expect(account.privateKey).toBe('privateKeyMock')
    expect(account.viewKey).toBe('viewKeyMock')
  })
})
