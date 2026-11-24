// dist를 웹 배포 폴더로 옮기고, 폰 앱이 받을 서명된 화면 묶음을 만든다.
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

/** 이 화면이 필요로 하는 네이티브 기능 수준. AppUpdatePlugin.kt의 NATIVE_API와 맞춘다. */
const REQUIRES = 1
const KEY = process.env.ASSISTANT_UPDATE_KEY ?? join(homedir(), '.assistant', 'update-key.pem')

const { version } = JSON.parse(readFileSync('dist/version.json', 'utf8'))

const files = {}
for (const entry of readdirSync('dist', { recursive: true, withFileTypes: true })) {
  // 안드로이드 WebView는 woff2를 쓰므로 woff는 싣지 않는다.
  if (!entry.isFile() || entry.name.endsWith('.woff')) continue
  const path = join(entry.parentPath, entry.name)
  files[relative('dist', path).split(sep).join('/')] = readFileSync(path)
}
const bundle = zipSync(files, { level: 9 })

const manifest = {
  version,
  requires: REQUIRES,
  sha256: createHash('sha256').update(bundle).digest('hex'),
  size: bundle.length,
}
const text = [manifest.version, manifest.requires, manifest.sha256, manifest.size].join('\n')
const signature = sign('sha256', Buffer.from(text), createPrivateKey(readFileSync(KEY))).toString('base64')

rmSync('deploy', { recursive: true, force: true })
cpSync('dist', 'deploy', { recursive: true })
mkdirSync('deploy/app-update')
writeFileSync(`deploy/app-update/bundle-${version}.zip`, bundle)
writeFileSync('deploy/app-update/manifest.json', JSON.stringify({ ...manifest, signature }))
console.log(`화면 묶음 ${version}, ${(bundle.length / 1024 / 1024).toFixed(1)}MB`)
