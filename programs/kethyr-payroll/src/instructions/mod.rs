// 各指令模块统一 glob 重导出：除账户结构体外，还会把 Anchor 生成的
// `__client_accounts_*` 模块带到 `crate::__client_accounts_*`，供 `#[program]`
// 宏引用。各模块的 handler 已按指令名唯一命名，避免 glob 重导出歧义。

pub mod cancel_stream;
pub mod claim_stream;
pub mod close_stream;
pub mod create_stream;
pub mod initialize_company;
pub mod update_company;

pub use cancel_stream::*;
pub use claim_stream::*;
pub use close_stream::*;
pub use create_stream::*;
pub use initialize_company::*;
pub use update_company::*;
