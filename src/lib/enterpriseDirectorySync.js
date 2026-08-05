import { enterpriseDirectory } from '../enterprise/mockDirectory'

const syncUrl = import.meta.env.VITE_ARTI_SYNC_URL || ''

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function findFromFallbackDirectory(role, email) {
  const normalizedEmail = normalizeEmail(email)

  if (role === 'teacher') {
    const profile = enterpriseDirectory.teachers.find((item) => normalizeEmail(item.email) === normalizedEmail)
    return profile || null
  }

  if (role === 'parent') {
    const profile = enterpriseDirectory.parents.find((item) => normalizeEmail(item.email) === normalizedEmail)
    return profile || null
  }

  return null
}

async function requestEnterprise(path, method, body) {
  if (!syncUrl) {
    throw new Error('Sync API not configured')
  }

  const response = await fetch(`${syncUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || `Enterprise request failed: ${response.status}`)
  }

  return payload
}

export async function lookupEnterpriseProfile(role, email) {
  const normalizedRole = String(role || '').trim().toLowerCase()

  if (!syncUrl) {
    return {
      source: 'fallback',
      profile: findFromFallbackDirectory(normalizedRole, email),
    }
  }

  try {
    const response = await fetch(`${syncUrl}/api/enterprise/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: normalizedRole, email }),
    })

    if (response.status === 404) {
      return {
        source: 'api',
        profile: null,
      }
    }

    if (!response.ok) {
      throw new Error(`Enterprise lookup failed: ${response.status}`)
    }

    const payload = await response.json()
    return {
      source: 'api',
      profile: payload?.profile || null,
    }
  } catch {
    return {
      source: 'fallback',
      profile: findFromFallbackDirectory(normalizedRole, email),
    }
  }
}

export async function createEnterpriseClass({ teacherId, name, grade }) {
  return requestEnterprise('/api/enterprise/classes', 'POST', { teacherId, name, grade })
}

export async function updateEnterpriseClass(classId, { name, grade }) {
  return requestEnterprise(`/api/enterprise/classes/${encodeURIComponent(classId)}`, 'PATCH', { name, grade })
}

export async function archiveEnterpriseClass(classId) {
  return requestEnterprise(`/api/enterprise/classes/${encodeURIComponent(classId)}/archive`, 'POST')
}

export async function createEnterprisePupil({ classId, name, communicationGoal }) {
  return requestEnterprise('/api/enterprise/pupils', 'POST', { classId, name, communicationGoal })
}

export async function updateEnterprisePupil(pupilId, { name, communicationGoal }) {
  return requestEnterprise(`/api/enterprise/pupils/${encodeURIComponent(pupilId)}`, 'PATCH', { name, communicationGoal })
}

export async function archiveEnterprisePupil(pupilId) {
  return requestEnterprise(`/api/enterprise/pupils/${encodeURIComponent(pupilId)}/archive`, 'POST')
}
