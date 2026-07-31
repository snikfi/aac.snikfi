import process from 'node:process'

import { createClient } from '@supabase/supabase-js'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

const app = express()

const port = Number(process.env.PORT || 8787)
const corsOrigin = process.env.CORS_ORIGIN || '*'
const syncToken = process.env.ARTI_SYNC_TOKEN || ''
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const tableName = process.env.SUPABASE_TILE_TABLE || 'tile_config'

app.use(helmet())
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim()) }))
app.use(express.json({ limit: '2mb' }))

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

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

  return true
}

function requireSyncToken(req, res, next) {
  if (!syncToken) {
    return next()
  }

  const incomingToken = req.header('x-arti-sync-token')
  if (incomingToken && incomingToken === syncToken) {
    return next()
  }

  return res.status(401).json({ error: 'Unauthorized' })
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

app.put('/api/tile-config', requireSyncToken, async (req, res) => {
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
