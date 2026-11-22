window.__ModuleLoader__.load({
  id: '@local/dsh-chatgpt-sign-in',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const key = 'dshChatGptSignIn'
    const plugin = '@local/dsh-chatgpt-sign-in'
    const methodNames = ['status', 'signIn', 'cancel', 'signOut', 'refresh']

    function descriptors() {
      return {
        package: plugin,
        descriptors: methodNames.map(method => ({
          id: `${plugin}#${key}/${method}`,
          service: key,
          namespace: key,
          method,
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'src-json' },
          sourceLocation: { file: 'src/index.js', line: 1, column: 1 },
        })),
      }
    }

    function Card({ ctx, mounted }) {
      const [state, setState] = useState()
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState()

      async function call(method) {
        await mounted
        const service = ctx.get(`remote.${key}`)
        if (!service) throw new Error('暂时无法读取 ChatGPT 登录服务，请重开模型设置。')
        const result = await service[method]()
        if (!result.ok) throw new Error(result.error?.message ?? 'ChatGPT 操作失败。')
        return result.value
      }

      useEffect(() => {
        let closed = false
        const refresh = () => {
          void call('status').then(value => {
            if (!closed) {
              setState(value)
              setError(undefined)
            }
          }, failure => {
            if (!closed) setError(failure.message)
          })
        }
        refresh()
        const timer = setInterval(refresh, 1500)
        return () => { closed = true; clearInterval(timer) }
      }, [ctx, mounted])

      async function act(method) {
        setBusy(true)
        setError(undefined)
        try {
          setState(await call(method))
        } catch (failure) {
          setError(failure.message)
        } finally {
          setBusy(false)
        }
      }

      const connecting = state?.status === 'connecting'
      const connected = state?.status === 'connected'
      const label = connecting ? '请在浏览器完成 ChatGPT 授权。'
        : state?.sharing ? `订阅授权已连接，已读取 ${state.modelCount} 个模型。`
        : connected ? '账号已登录，套餐用量等待授权。'
        : state?.status === 'reauth_required' ? '请重新连接 ChatGPT。'
        : state ? '使用 ChatGPT 订阅运行 DSH 模型。' : '正在读取登录状态…'

      return h('div', { style: { display: 'grid', gap: '0.75rem' } },
        h('div', { role: 'status' }, label),
        error || state?.error ? h('div', { role: 'alert' }, error ?? state.error) : null,
        h('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } },
          connecting
            ? h(Button, { variant: 'outline', disabled: busy, onClick: () => act('cancel') }, '取消登录')
            : state?.sharing
              ? h(Button, { variant: 'outline', disabled: busy, onClick: () => act('refresh') }, '刷新模型')
              : h(Button, { variant: 'primary', disabled: busy || !state, onClick: () => act('signIn') }, '使用 ChatGPT 登录'),
          !connecting && connected
            ? h(Button, { variant: 'outline', disabled: busy, onClick: () => act('signOut') }, '断开连接')
            : null
        )
      )
    }

    return {
      inject: ['slots', 'remote'],
      apply(ctx) {
        const mounted = ctx.remote.$mount(descriptors())
        void mounted.catch(() => {})
        ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register(
          { name: 'settings.models.provider-card', key: 'chatgpt-sign-in' },
          () => h(Card, { ctx, mounted }),
        ))
      },
    }
  },
})
