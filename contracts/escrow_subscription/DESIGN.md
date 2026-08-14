# AleoPay Escrow Subscription Design

## Overview

This document describes the record model, state transitions, and access-control rules for the `escrow_subscription.aleo` Leo program.

## Records

### `EscrowRecord`

Represents a subscription escrow funded by a subscriber and drawn down by a merchant.

| Field | Type | Description |
|-------|------|-------------|
| `owner` | `address` | Subscriber who authorized and funded the escrow. |
| `merchant` | `address` | Merchant authorized to pull payments. |
| `total_amount` | `u64` | Original amount locked in the escrow. |
| `remaining_amount` | `u64` | Amount still available for future pulls. |
| `interval` | `u32` | Billing interval expressed as a block/time period count. |
| `created_at` | `u32` | Creation timestamp / period anchor. |
| `last_charged_at` | `u32` | Timestamp / period anchor of the most recent successful pull. |
| `serial_number` | `field` | Unique escrow identifier used for nullification. |

The `owner` field is set to `self.signer` when the record is created so that the record belongs to the transaction signer, satisfying the Aleo record-ownership requirement.

### `PaymentRecord`

Emitted each time the merchant pulls a payment from an escrow.

| Field | Type | Description |
|-------|------|-------------|
| `merchant` | `address` | Merchant who received the payment. |
| `amount` | `u64` | Amount pulled in this period. |
| `period` | `u32` | Period number for this charge (1-indexed). |
| `escrow_serial_reference` | `field` | `serial_number` of the consumed escrow record. |

## Serial Number & Nullifier Rules

- `serial_number` is generated at escrow creation by hashing the subscriber, merchant, total amount, and interval:

  ```
  serial_number = BHP256::hash_to_field(SerialInput {
      subscriber: self.signer,
      merchant,
      total_amount,
      interval,
  })
  ```

- Nullifier generation is performed by the Aleo protocol when an `EscrowRecord` is consumed. The nullifier uniquely marks the spent record and is derived from the record's serial number and the owner's private key:

  ```
  nullifier = PRF(serial_number, owner_private_key)
  ```

  In Leo this is implicit; consuming a record input produces the nullifier automatically.

## State Transition Diagram

```
                       authorize_subscription
   Subscriber  -------------------------------------->  EscrowRecord
     (signer)          merchant, total_amount,          owner = subscriber
                       interval                          remaining = total_amount
                                                         created_at, last_charged_at
                                                         serial_number


                       pull_payment                         +----------------+
   Merchant      --------------------------->  EscrowRecord' |  PaymentRecord |
     (signer)      escrow, amount                remaining -= amount          merchant = escrow.merchant
                                                last_charged_at += interval   amount
                                                period += 1                   period
                                                                              escrow_serial_reference


                       cancel_subscription
   Subscriber  -------------------------------------->  u64 (remaining_amount)
     (signer)          escrow                            EscrowRecord consumed
```

## Access Control

| Function | Caller Constraint |
|----------|-------------------|
| `authorize_subscription` | Owner is implicit (`self.signer`). |
| `pull_payment` | Only `escrow.merchant` (`self.signer == escrow.merchant`). |
| `cancel_subscription` | Only `escrow.owner` (`self.signer == escrow.owner`). |

## Notes

- `created_at` and `last_charged_at` are stored as `u32` period anchors. In a production deployment these would be populated from `block.height` inside a `final` block; for this POC they are initialized to `0u32` and advanced by `interval` on each pull.
- `cancel_subscription` returns the remaining balance as a `u64`. A production version may instead emit a `RefundRecord` to the subscriber.
