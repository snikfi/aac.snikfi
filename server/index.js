import process from 'node:process'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

const app = express()

const port = Number(process.env.PORT || 8787)
const corsOrigin = process.env.CORS_ORIGIN || '*'
const adminPin = process.env.ARTI_ADMIN_PIN || ''
const adminSessionSecret = process.env.ARTI_ADMIN_SESSION_SECRET || ''
const adminSessionTtlHours = Number(process.env.ARTI_ADMIN_SESSION_TTL_HOURS || 12)
const adminMaxAttempts = Math.max(1, Number(process.env.ARTI_ADMIN_MAX_ATTEMPTS || 5))
const adminLockoutMinutes = Math.max(1, Number(process.env.ARTI_ADMIN_LOCKOUT_MINUTES || 15))
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const tableName = process.env.SUPABASE_TILE_TABLE || 'tile_config'

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim()) }))
app.use(express.json({ limit: '2mb' }))

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

if (!adminPin || !adminSessionSecret) {
  console.error('Missing ARTI_ADMIN_PIN or ARTI_ADMIN_SESSION_SECRET environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const adminUnlockAttempts = new Map()

function isValidTileConfig(config) {
  if (!config || typeof config !== 'object') {
    return false
  }

  if (!Array.isArray(config.subjects) || !Array.isArray(config.verbs)) {
    return false
  }

  if (!config.objectsByVerb || typeof config.objectsByVerb !== 'object') {
    return false
  }

  if (config.quickWords !== undefined && !Array.isArray(config.quickWords)) {
    return false
  }

  return true
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function signTokenPayload(encodedPayload) {
  return createHmac('sha256', adminSessionSecret).update(encodedPayload).digest('base64url')
}

function issueAdminToken() {
  const expiresInSeconds = Math.max(1, Math.floor(adminSessionTtlHours * 60 * 60))
  const payload = {
    exp: Date.now() + expiresInSeconds * 1000,
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = signTokenPayload(encodedPayload)

  return {
    token: `${encodedPayload}.${signature}`,
    expiresInSeconds,
  }
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') {
    return false
  }

  const [encodedPayload, incomingSignature] = token.split('.')
  if (!encodedPayload || !incomingSignature) {
    return false
  }

  const expectedSignature = signTokenPayload(encodedPayload)
  if (!safeEqualText(incomingSignature, expectedSignature)) {
    return false
  }

  try {
    const payloadRaw = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadRaw)
    return Number(payload?.exp) > Date.now()
  } catch {
    return false
  }
}

function requireAdminSession(req, res, next) {
  const authorization = req.header('authorization') || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return next()
}

function getUnlockAttemptKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function getUnlockAttemptState(key) {
  const current = adminUnlockAttempts.get(key)
  if (!current) {
    return { failures: 0, lockedUntil: 0 }
  }

  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    adminUnlockAttempts.delete(key)
    return { failures: 0, lockedUntil: 0 }
  }

  return current
}

function clearUnlockAttemptState(key) {
  adminUnlockAttempts.delete(key)
}

function recordUnlockFailure(key) {
  const current = getUnlockAttemptState(key)
  const failures = current.failures + 1

  if (failures >= adminMaxAttempts) {
    const lockedUntil = Date.now() + adminLockoutMinutes * 60 * 1000
    const nextState = { failures, lockedUntil }
    adminUnlockAttempts.set(key, nextState)
    return nextState
  }

  const nextState = { failures, lockedUntil: 0 }
  adminUnlockAttempts.set(key, nextState)
  return nextState
}

async function readStoredConfig() {
  const { data, error } = await supabase
    .from(tableName)
    .select('config, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return { config: null, updatedAt: null }
  }

  return {
    config: data.config || null,
    updatedAt: data.updated_at || null,
  }
}

async function writeStoredConfig(config) {
  const updatedAt = new Date().toISOString()

  const { error } = await supabase.from(tableName).upsert(
    {
      id: 1,
      config,
      updated_at: updatedAt,
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw error
  }

  return updatedAt
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/tile-config', async (_req, res) => {
  try {
    const stored = await readStoredConfig()
    return res.json(stored)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to load tile config' })
  }
})

app.post('/api/admin/unlock', (req, res) => {
  const attemptKey = getUnlockAttemptKey(req)
  const attemptState = getUnlockAttemptState(attemptKey)

  if (attemptState.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((attemptState.lockedUntil - Date.now()) / 1000))
    return res.status(429).json({
      error: 'Too many attempts',
      retryAfterSeconds,
    })
  }

  const pin = req.body?.pin

  if (!safeEqualText(pin, adminPin)) {
    const nextState = recordUnlockFailure(attemptKey)

    if (nextState.lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((nextState.lockedUntil - Date.now()) / 1000))
      return res.status(429).json({
        error: 'Too many attempts',
        retryAfterSeconds,
      })
    }

    return res.status(401).json({
      error: 'Unauthorized',
      attemptsRemaining: Math.max(0, adminMaxAttempts - nextState.failures),
    })
  }

  clearUnlockAttemptState(attemptKey)
  const session = issueAdminToken()
  return res.json(session)
})

app.put('/api/tile-config', requireAdminSession, async (req, res) => {
  const config = req.body?.config

  if (!isValidTileConfig(config)) {
    return res.status(400).json({ error: 'Invalid config payload' })
  }

  try {
    const updatedAt = await writeStoredConfig(config)

    return res.json({ ok: true, updatedAt })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to save tile config' })
  }
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Arti sync API listening on port ${port}`)
})
