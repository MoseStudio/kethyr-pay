/**
 * KethyrPay SDK 公共类型定义。
 *
 * `PaymentIntent` 与 `PaymentStatus` 是 ALEO-MVP-007（createPayment）与
 * ALEO-MVP-008（verifyPayment）的契约类型。contract 升级到 v3 后，
 * `PaymentIntent.transaction` 携带的是 v3 `pay_invoice` 4-input 原子结算
 * 交易参数（invoice record + amount + sender_ciphertext + credits token）。
 */

/** 支付意图：由商家侧 createPayment() 生成，可渲染为支付链接供付款人打开 */
export interface PaymentIntent {
  /** 发票 ID（唯一标识一次支付意图） */
  invoice_id: string
  /** 支付金额（单位：credits，十进制字符串，如 "1.5"） */
  amount: string
  /** 收款商家地址（aleo1...）或商家标识 */
  merchant: string
  /** 过期时间（ISO 8601 字符串） */
  expires_at: string
  /** 可直接打开的支付链接（Hosted Checkout 落地页，如 /pay/:invoiceId） */
  payment_url: string
  /** pay_private_v3.aleo `pay_invoice` 交易参数（v3 4-input 原子结算：invoice + amount + sender_ciphertext + token；可直接交给钱包 signTransaction） */
  transaction: import('@provablehq/aleo-types').TransactionOptions
}

/** 支付状态机的最终状态 */
export type PaymentStatus =
  | {
      /** 交易已广播，等待链上确认 */
      status: 'pending'
      /** 交易 ID（transition id / tx id） */
      transaction_id: string
    }
  | {
      /** 链上确认成功，返回回执数据 */
      status: 'confirmed'
      /** 交易 ID（transition id / tx id） */
      transaction_id: string
      /** 确认金额（credits，十进制字符串） */
      amount: string
      /** 关联发票 ID */
      invoice_id: string
    }
  | {
      /** 支付失败（余额不足 / 重复支付 / 过期 / 网络错误等） */
      status: 'failed'
      /** 失败原因（规范化错误信息） */
      error: string
      /** 交易 ID（如已广播，可选） */
      transaction_id?: string
    }

/** 创建支付意图的输入参数（ALEO-MVP-007 使用） */
export interface CreatePaymentParams {
  /** 支付金额（credits，十进制字符串或数字） */
  amount: string | number
  /** 收款商家地址 */
  merchant: string
  /** 附加元数据（可选） */
  metadata?: Record<string, unknown>
  /** 发票过期时长（毫秒，默认 30 分钟） */
  expiresInMs?: number
}
