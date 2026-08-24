:
# Deployment Log — escrow_subscription.aleo

## ALEO-POC-020 Status

**Result:** ✅ Deployed to Aleo Testnet

### Deployment Info

| Field | Value |
|-------|-------|
| Network | testnet |
| Program ID | `escrow_subscription.aleo` |
| Deployer Address | `aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69` |
| Transaction ID | `at1cp0e87mtvr54tm4tre76t2d48mggvpuuemaw6j79q3z8rpnkvy8sjnngvd` |
| Fee Transaction ID | `at137jnvt3j8jnwue63w56rpgxn8pvzufvmg2c45aqz2jx5kddswg9q0rvq2v` |
| Endpoint | `https://api.provable.com/v2/testnet` |
| Total Fee | 6.417802 credits |
| Confirmed | ✅ Yes |

### Deployment Command Used

```bash
cd /home/moseyah/code/kethyr/contracts/escrow_subscription/escrow_subscription
leo deploy --network testnet --broadcast --yes --json-output=deploy-output.json
```

### Program Functions

- `authorize_subscription(merchant: address, total_amount: u64, interval: u32) -> EscrowRecord`
- `pull_payment(escrow: EscrowRecord, amount: u64) -> (EscrowRecord, PaymentRecord)`
- `cancel_subscription(escrow: EscrowRecord) -> u64`

### Frontend Configuration

The deployed program ID matches the local program ID (`escrow_subscription.aleo`), so no code change is required in `frontend/demo/src/lib/contract.ts`.

To enable real transactions, set the environment variable:

```bash
VITE_USE_REAL_TRANSACTIONS=true
```

### Explorer Links

- Transaction: `https://explorer.provable.com/transaction/at1cp0e87mtvr54tm4tre76t2d48mggvpuuemaw6j79q3z8rpnkvy8sjnngvd`
- Program: `https://explorer.provable.com/program/escrow_subscription.aleo`

> ⚠️ Security reminder: the `.env` file containing `PRIVATE_KEY` is gitignored and must never be committed.
