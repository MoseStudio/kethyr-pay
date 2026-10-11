import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

/**
 * CSRF 保护 server functions（同源校验）。
 * 当前应用没有 server function，保留它是为了将来加 API 时默认安全。
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))
