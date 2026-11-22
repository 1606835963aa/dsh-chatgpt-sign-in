import { ProxyAgent } from 'undici'

const OPENAI_ORIGINS = new Set(['https://auth.openai.com', 'https://api.openai.com'])

export function createOpenAITransport(proxyUrl) {
  if (!proxyUrl) return undefined

  const proxy = new URL(proxyUrl)
  if (!['http:', 'https:'].includes(proxy.protocol) || proxy.username || proxy.password ||
      proxy.pathname !== '/' || proxy.search || proxy.hash) {
    throw new Error('ChatGPT 代理地址应为 HTTP 或 HTTPS 地址，不带账号、密码或路径。')
  }
  const dispatcher = new ProxyAgent(proxy.href)

  return {
    fetch(input, init) {
      const target = new URL(input instanceof Request ? input.url : input)
      if (!OPENAI_ORIGINS.has(target.origin)) throw new Error('ChatGPT 请求地址不在允许的 OpenAI 域名内。')
      return globalThis.fetch(input, { ...init, dispatcher, redirect: 'error' })
    },
    close() {
      return dispatcher.destroy()
    },
  }
}
