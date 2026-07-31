const syncUrl = import.meta.env.VITE_ARTI_SYNC_URL || ''
const syncToken = import.meta.env.VITE_ARTI_SYNC_TOKEN || ''

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

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (syncToken) {
    headers['x-arti-sync-token'] = syncToken
  }

  return headers
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
  if (!syncUrl) {
    return null
  }

  const response = await withTimeout(
    fetch(`${syncUrl}/api/tile-config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    }),
  )

  if (!response.ok) {
    throw new Error(`Failed to save tile config: ${response.status}`)
  }

  return response.json()
}
