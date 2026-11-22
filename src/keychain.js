import { spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const SERVICE = 'local.dsh.chatgpt-sign-in.encryption'
const ACCOUNT = 'chatgpt-session'

async function security(args, input = '') {
  const child = spawn('/usr/bin/security', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  let output = ''
  let error = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk })
  child.stderr.setEncoding('utf8').on('data', chunk => { error += chunk })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve({ code, output, error }))
  })
}

async function readKey() {
  const result = await security(['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'])
  const value = result.output.trim()
  if (result.code === 0 && /^[0-9a-f]{64}$/.test(value)) return Buffer.from(value, 'hex')
  if (result.code === 44 || result.error.includes('could not be found')) return undefined
  throw new Error('无法读取 macOS 钥匙串里的 ChatGPT 登录密钥。')
}

export function keychainEncryption() {
  let keyPromise
  const key = (create) => {
    keyPromise ??= (async () => {
      const current = await readKey()
      if (current || !create) return current

      // security 的交互输入走 stdin，避免把密钥放进进程参数。
      const generated = randomBytes(32).toString('hex')
      await security(['-i'], `add-generic-password -s "${SERVICE}" -a "${ACCOUNT}" -w "${generated}"\n`)
      const stored = await readKey()
      if (!stored) throw new Error('无法在 macOS 钥匙串创建 ChatGPT 登录密钥。')
      return stored
    })().then(value => {
      if (!value) keyPromise = undefined
      return value
    }, error => {
      keyPromise = undefined
      throw error
    })
    return keyPromise
  }

  return {
    id: 'dsh-macos-keychain-aes-gcm-v1',
    isAvailable: () => process.platform === 'darwin',
    async encrypt(plaintext) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', await key(true), iv)
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), data])
    },
    async decrypt(ciphertext) {
      const data = Buffer.from(ciphertext)
      const secret = await key(false)
      if (!secret || data.length < 28) throw new Error('找不到 ChatGPT 登录所需的钥匙串密钥。')
      const decipher = createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12))
      decipher.setAuthTag(data.subarray(12, 28))
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
    },
  }
}
