import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'

export const ROUTE = 'chatgpt-sign-in'
export const LABEL = 'ChatGPT 订阅'
const UPSTREAM_ROUTE = 'openai'
const GPT_62_MODELS = new Map([
  ['gpt-6.2-astra', { fallbackId: 'gpt-6-astra', contextLimit: 1_050_000 }],
  ['gpt-6.2-sol', { fallbackId: 'gpt-6-sol', contextLimit: 1_050_000 }],
])

const requireFromHost = createRequire(import.meta.resolve('@deepseek-ai/dsh-llm-pi-ai/package.json'))
const piDirectory = requireFromHost.resolve.paths('@earendil-works/pi-ai')
  .map(root => join(root, '@earendil-works', 'pi-ai', 'dist'))
  .find(path => existsSync(join(path, 'providers', 'openai.js')))
if (!piDirectory) throw new Error('此版本 DeepSeek Harness 缺少 OpenAI 模型适配器。')

const [{ openaiProvider }, { InMemoryCredentialStore, defaultProviderAuthContext }] = await Promise.all([
  import(pathToFileURL(join(piDirectory, 'providers', 'openai.js')).href),
  import(pathToFileURL(join(piDirectory, 'index.js')).href),
])

export function createAdapter(auth, getCatalog, resolveAttachments, fetch, modelContextWindows = {}) {
  const catalog = openaiProvider()
  const provider = fetch ? {
    ...catalog,
    stream: (model, context, options) => catalog.stream(model, context, { ...options, fetch }),
    streamSimple: (model, context, options) => catalog.streamSimple(model, context, { ...options, fetch }),
  } : catalog
  const known = new Map(catalog.getModels().filter(model => model.api === 'openai-responses').map(model => [model.id, model]))
  const profiles = new Map()
  let profileCatalog
  let snapshot = profiles
  const native = new PiAiAdapter({
    profiles() {
      const allowed = getCatalog()
      if (allowed === profileCatalog && snapshot.size) return snapshot
      profileCatalog = allowed
      const models = (allowed ?? []).flatMap(model => {
        const metadata = GPT_62_MODELS.get(model.slug)
        const descriptor = known.get(model.slug) ?? known.get(metadata?.fallbackId)
        if (!descriptor) return []
        const configuredContext = modelContextWindows[model.slug]
        const contextWindow = configuredContext === undefined
          ? descriptor.contextWindow
          : Math.min(configuredContext, metadata?.contextLimit ?? descriptor.contextWindow)
        return [{ ...descriptor, id: model.slug, name: model.displayName, contextWindow }]
      })
      snapshot = new Map([[UPSTREAM_ROUTE, {
        provider: UPSTREAM_ROUTE,
        displayName: LABEL,
        streamIdleTimeoutMs: 120_000,
        configuredMaxTokens: new Map(),
        modelErrors: new Map(),
        maxRequestImageBytes: 24 * 1024 * 1024,
        requestImagePixelBudget: 20_000_000,
        requestImageMaxBytes: 10 * 1024 * 1024,
        piProvider: { ...provider, getModels: () => models },
      }]])
      return snapshot
    },
    async resolveApiKey() {
      try {
        return await auth.accessToken()
      } catch (error) {
        if (['sign_in_required', 'sharing_not_enabled'].includes(error.code)) {
          throw new LlmError('请在设置 → 模型 → ChatGPT 订阅里登录并授权套餐用量。', 'MISSING_CREDENTIAL')
        }
        throw new LlmError(error.message, 'CHATGPT_AUTH')
      }
    },
    auth: {
      credentials: new InMemoryCredentialStore(),
      authContext: defaultProviderAuthContext(),
    },
    resolveAttachments,
  })

  class ChatGptProvider extends LlmAdapter {
    providerInfo() {
      return { id: ROUTE, name: LABEL }
    }

    async listModels() {
      if (!getCatalog()?.length) return []
      const models = await native.listModels(UPSTREAM_ROUTE)
      return models.map(model => ({ ...model, provider: ROUTE }))
    }

    async resolveModel(_provider, model, signal) {
      const info = await native.resolveModel(UPSTREAM_ROUTE, model, signal)
      return { ...info, provider: ROUTE }
    }

    async prepareCall(_provider, model, signal) {
      const call = await native.prepareCall(UPSTREAM_ROUTE, model, signal)
      return {
        ...call,
        model: { ...call.model, provider: ROUTE },
        stream: options => call.stream({ ...options, provider: UPSTREAM_ROUTE }),
      }
    }

    stream(options) {
      return native.stream({ ...options, provider: UPSTREAM_ROUTE })
    }

    imageRequestTarget(_provider, model, image) {
      return native.imageRequestTarget(UPSTREAM_ROUTE, model, image)
    }
  }
  return new ChatGptProvider()
}
