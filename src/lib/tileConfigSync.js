const syncUrl = import.meta.env.VITE_ARTI_SYNC_URL || ''
let adminSessionToken = ''

function withTimeout(promise, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

function getHeaders(includeAdminAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (includeAdminAuth && adminSessionToken) {
    headers.Authorization = `Bearer ${adminSessionToken}`
  }

  return headers
}

function createAdminUnlockError(message, details = {}) {
  const error = new Error(message)
  Object.assign(error, details)
  return error
}

export function clearAdminSession() {
  adminSessionToken = ''
}

export function hasAdminSession() {
  return Boolean(adminSessionToken)
}

export async function unlockAdminSession(pin) {
  if (!syncUrl) {
    throw new Error('Sync API not configured')
  }

  const response = await withTimeout(
    fetch(`${syncUrl}/api/admin/unlock`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ pin }),
    }),
  )

  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    const payload = await response.json().catch(() => null)
    throw createAdminUnlockError('Invalid admin code', {
      code: 'INVALID_ADMIN_CODE',
      attemptsRemaining: payload?.attemptsRemaining,
    })
  }

  if (response.status === 429) {
    const payload = await response.json().catch(() => null)
    throw createAdminUnlockError('Admin unlock temporarily locked', {
      code: 'ADMIN_UNLOCK_LOCKED',
      retryAfterSeconds: payload?.retryAfterSeconds,
    })
  }

  if (!response.ok) {
    throw new Error(`Failed to unlock admin: ${response.status}`)
  }

  const payload = await response.json()
  if (!payload?.token) {
    throw new Error('Invalid unlock response')
  }

  adminSessionToken = payload.token
  return payload
}

export function isRemoteSyncEnabled() {
  return Boolean(syncUrl)
}

export async function fetchRemoteTileConfig() {
  if (!syncUrl) {
    return null
  }

  const response = await withTimeout(fetch(`${syncUrl}/api/tile-config`, { method: 'GET' }))
  if (!response.ok) {
    throw new Error(`Failed to fetch tile config: ${response.status}`)
  }

  const payload = await response.json()
  return payload?.config || null
}

export async function saveRemoteTileConfig(config) {
  if (!syncUrl || !adminSessionToken) {
    return null
  }

  const response = await withTimeout(
    fetch(`${syncUrl}/api/tile-config`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ config }),
    }),
  )

  if (response.status === 401) {
    clearAdminSession()
    throw new Error('Admin session expired')
  }

  if (!response.ok) {
    throw new Error(`Failed to save tile config: ${response.status}`)
  }

  return response.json()
}
