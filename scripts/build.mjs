import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = new URL('../vendor/siwc/', import.meta.url)
const target = new URL('../lib/siwc/', import.meta.url)
await rm(new URL('responses.js', target), { force: true })
await mkdir(target, { recursive: true })
for (const file of await readdir(source)) {
  if (!file.endsWith('.ts')) continue
  const input = await readFile(new URL(file, source), 'utf8')
  const code = stripTypeScriptTypes(input, { mode: 'strip' })
  await writeFile(new URL(file.replace(/\.ts$/, '.js'), target), code)
}
