import { Account, initThreadPool, initializeWasm } from '@provablehq/sdk/testnet.js'

let aleoReady = false

export async function initAleoSDK(): Promise<void> {
  if (aleoReady) return

  await initializeWasm()
  await initThreadPool(4)
  aleoReady = true
}

export interface AleoAccount {
  address: string
  privateKey: string
  viewKey: string
}

export function createAccount(): AleoAccount {
  const account = new Account()

  return {
    address: account.address().to_string(),
    privateKey: account.privateKey().to_string(),
    viewKey: account.viewKey().to_string(),
  }
}
