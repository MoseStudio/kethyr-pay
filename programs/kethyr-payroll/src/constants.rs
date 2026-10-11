//! 全局常量与 PDA 种子。

/// 企业配置 PDA 种子前缀：`[COMPANY_SEED, authority]`
pub const COMPANY_SEED: &[u8] = b"company";

/// 流 PDA 种子前缀：`[STREAM_SEED, company, stream_id]`
pub const STREAM_SEED: &[u8] = b"stream";

/// 预扣税率的基准点分母：10000 bps = 100%。
pub const BPS_BASE: u16 = 10_000;
