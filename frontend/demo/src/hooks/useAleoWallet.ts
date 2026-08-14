// Re-export from the client-only wallet context.
// The actual wallet adapter is loaded dynamically in <WalletProviders>.
export { useAleoWallet } from '@/contexts/AleoWalletContext.tsx'
export type { AleoWallet } from '@/contexts/AleoWalletContext.tsx'
