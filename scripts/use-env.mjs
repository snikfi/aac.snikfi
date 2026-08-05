import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const profile = String(process.argv[2] || '').trim().toLowerCase()
const allowedProfiles = new Set(['main', 'enterprise'])

if (!allowedProfiles.has(profile)) {
  console.error('Usage: npm run env:main OR npm run env:enterprise')
  process.exit(1)
}

const root = process.cwd()

const frontendSource = resolve(root, `.env.local.${profile}`)
const frontendTarget = resolve(root, '.env.local')

const apiSource = resolve(root, 'server', `.env.${profile}`)
const apiTarget = resolve(root, 'server', '.env')

const missing = []

if (!existsSync(frontendSource)) {
  missing.push(`Missing ${frontendSource}`)
}

if (!existsSync(apiSource)) {
  missing.push(`Missing ${apiSource}`)
}

if (missing.length) {
  for (const line of missing) {
    console.error(line)
  }
  console.error('Create these files once, then run the env switch command again.')
  process.exit(1)
}

copyFileSync(frontendSource, frontendTarget)
copyFileSync(apiSource, apiTarget)

console.log(`Activated ${profile} env profile.`)
console.log(`Frontend: ${frontendSource} -> ${frontendTarget}`)
console.log(`API: ${apiSource} -> ${apiTarget}`)
