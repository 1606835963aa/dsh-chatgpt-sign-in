import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import schema from '@deepseek-ai/schemastery'
import { createChatGPT } from '../lib/siwc/index.js'
import { createAdapter, LABEL, ROUTE } from './adapter.js'
import { keychainEncryption } from './keychain.js'
import { createOpenAITransport } from './transport.js'

export const name = ROUTE
export const inject = ['llm']
export const Config = schema.object({
  stateDir: schema.string().required().volatile(),
  proxyUrl: schema.string().volatile(),
  modelContextWindows: schema.dict(schema.number().step(1).min(1_024)).volatile(),
})

const SERVICE = 'dshChatGptSignIn'
const run = promisify(execFile)
const initializers = []

class SignInController extends TypertRemoteService {
  constructor(ctx, account) {
    super(ctx, SERVICE, { namespace: SERVICE })
    this.account = account
    for (const initialize of initializers) initialize.call(this)
  }

  status() { return this.account.status() }
  signIn() { return this.account.signIn() }
  cancel() { return this.account.cancel() }
  signOut() { return this.account.signOut() }
  refresh() { return this.account.refresh() }
}

for (const name of ['status', 'signIn', 'cancel', 'signOut', 'refresh']) {
  Remote(SignInController.prototype[name], {
    kind: 'method',
    name,
    static: false,
    private: false,
    addInitializer: initialize => initializers.push(initialize),
  })
}

function createAccount(ctx, auth) {
  let models = []
  let pending
  let lastError
  let disposed = false

  function publish(next) {
    if (disposed) return
    models = next
    ctx.emit('llm/adapters-updated')
  }

  function rememberError(error) {
    lastError = error?.code === 'cancelled' ? undefined : error?.message
  }

  async function refresh() {
    const session = await auth.getSession()
    if (!session.sharing) {
      if (models.length) publish([])
      return
    }
    try {
      const available = await auth.listModels()
      lastError = undefined
      publish(available)
    } catch (error) {
      rememberError(error)
    }
  }

  async function status() {
    const session = await auth.getSession()
    return {
      status: pending ? 'connecting' : session.status,
      sharing: session.sharing,
      modelCount: models.length,
      error: lastError ?? session.error?.message,
    }
  }

  return {
    models: () => models,
    status,
    async refresh() {
      await refresh()
      return status()
    },
    async signIn() {
      if (!pending) {
        lastError = undefined
        pending = auth.signIn({ reconsent: true }).then(refresh, rememberError).finally(() => {
          pending = undefined
        })
      }
      return status()
    },
    async cancel() {
      auth.cancelSignIn()
      await pending
      return status()
    },
    async signOut() {
      lastError = undefined
      try {
        await auth.disconnect()
      } catch (error) {
        rememberError(error)
      }
      if (!(await auth.getSession()).sharing) publish([])
      return status()
    },
    dispose() {
      disposed = true
      auth.cancelSignIn()
    },
  }
}

export function apply(ctx, config) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  const transport = createOpenAITransport(config.proxyUrl.get())
  const auth = createChatGPT({
    appName: 'DeepSeek Harness ChatGPT Sign-In',
    appId: 'dsh-chatgpt-sign-in',
    storageDir: config.stateDir.get(),
    redirectPort: 0,
    sendHostId: true,
    credentialEncryption: keychainEncryption(),
    fetch: transport?.fetch,
    async openBrowser(url) {
      if (new URL(url).origin !== 'https://auth.openai.com') throw new Error('ChatGPT 授权地址无效。')
      await run('/usr/bin/open', [url])
    },
  })

  const account = createAccount(ctx, auth)
  const adapter = createAdapter(
    auth,
    account.models,
    () => ctx.get('attachments'),
    transport?.fetch,
    config.modelContextWindows.get(),
  )
  ctx.effect(() => ctx.llm.registerAdapter([ROUTE], adapter))
  ctx.effect(() => ctx.llm.registerConfigurableProviders([{
    provider: ROUTE,
    displayName: LABEL,
    settingsNs: ROUTE,
    settingsPath: [],
  }]))
  ctx.effect(() => () => {
    account.dispose()
    void transport?.close().catch(() => {})
  })
  new SignInController(ctx, account)
  void account.refresh().catch(() => {})
}
