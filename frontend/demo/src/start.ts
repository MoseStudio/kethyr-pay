import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const wasmHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  const headers = new Headers(result.response.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')

  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, wasmHeadersMiddleware],
}))
