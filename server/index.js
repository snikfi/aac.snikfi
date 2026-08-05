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
const enterpriseRoles = new Set(['teacher', 'parent'])

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeText(value) {
  return String(value || '').trim()
}

function createScopedId(prefix) {
  const safePrefix = String(prefix || 'entity').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'entity'
  return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emailToDisplayName(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'Parent User'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'Parent User'
}

function isMissingEnterpriseTablesError(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === '42P01') {
    return true
  }

  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  return message.includes('relation') && message.includes('does not exist')
}

async function findEnterpriseUserByEmail(role, email) {
  const { data, error } = await supabase
    .from('enterprise_users')
    .select('id, role, email, full_name')
    .eq('role', role)
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

async function ensureParentUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  const existingParent = await findEnterpriseUserByEmail('parent', normalizedEmail)
  if (existingParent) {
    return existingParent
  }

  const parentId = createScopedId('parent')
  const { error: insertError } = await supabase
    .from('enterprise_users')
    .insert({
      id: parentId,
      role: 'parent',
      email: normalizedEmail,
      full_name: emailToDisplayName(normalizedEmail),
    })

  if (insertError) {
    if (insertError.code === '23505') {
      const createdParent = await findEnterpriseUserByEmail('parent', normalizedEmail)
      if (createdParent) {
        return createdParent
      }
    }

    throw insertError
  }

  return {
    id: parentId,
    role: 'parent',
    email: normalizedEmail,
    full_name: emailToDisplayName(normalizedEmail),
  }
}

async function findTeacherById(teacherId) {
  const { data, error } = await supabase
    .from('enterprise_users')
    .select('id, role, email, full_name')
    .eq('id', teacherId)
    .eq('role', 'teacher')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

async function findClassById(classId) {
  const { data, error } = await supabase
    .from('enterprise_classes')
    .select('id, teacher_user_id, name, grade, archived_at')
    .eq('id', classId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

async function findPupilById(pupilId) {
  const { data, error } = await supabase
    .from('enterprise_pupils')
    .select('id, class_id, name, communication_goal, archived_at')
    .eq('id', pupilId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

async function buildTeacherProfile(user) {
  const { data: classes, error: classesError } = await supabase
    .from('enterprise_classes')
    .select('id, name, grade, archived_at')
    .eq('teacher_user_id', user.id)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (classesError) {
    throw classesError
  }

  const classIds = (classes || []).map((item) => item.id)
  let pupils = []

  if (classIds.length) {
    const { data: pupilRows, error: pupilsError } = await supabase
      .from('enterprise_pupils')
      .select('id, class_id, name, communication_goal, archived_at')
      .in('class_id', classIds)
      .is('archived_at', null)
      .order('name', { ascending: true })

    if (pupilsError) {
      throw pupilsError
    }

    pupils = pupilRows || []
  }

  const pupilIds = pupils.map((item) => item.id)
  let links = []

  if (pupilIds.length) {
    const { data: parentLinks, error: linksError } = await supabase
      .from('enterprise_parent_child')
      .select('parent_user_id, pupil_id')
      .in('pupil_id', pupilIds)

    if (linksError) {
      throw linksError
    }

    links = parentLinks || []
  }

  const parentIds = [...new Set(links.map((item) => item.parent_user_id))]
  let parentUsers = []

  if (parentIds.length) {
    const { data: parentRows, error: parentError } = await supabase
      .from('enterprise_users')
      .select('id, email')
      .in('id', parentIds)

    if (parentError) {
      throw parentError
    }

    parentUsers = parentRows || []
  }

  const parentEmailById = new Map(parentUsers.map((item) => [item.id, item.email]))
  const parentEmailsByPupilId = new Map()

  links.forEach((item) => {
    const list = parentEmailsByPupilId.get(item.pupil_id) || []
    const email = parentEmailById.get(item.parent_user_id)
    if (email) {
      list.push(email)
      parentEmailsByPupilId.set(item.pupil_id, list)
    }
  })

  const pupilsByClassId = new Map()

  pupils.forEach((pupil) => {
    const bucket = pupilsByClassId.get(pupil.class_id) || []
    bucket.push({
      id: pupil.id,
      name: pupil.name,
      communicationGoal: pupil.communication_goal,
      parentEmails: parentEmailsByPupilId.get(pupil.id) || [],
    })
    pupilsByClassId.set(pupil.class_id, bucket)
  })

  return {
    id: user.id,
    email: user.email,
    name: user.full_name,
    classes: (classes || []).map((item) => ({
      id: item.id,
      name: item.name,
      grade: item.grade,
      pupils: pupilsByClassId.get(item.id) || [],
    })),
  }
}

async function buildParentProfile(user) {
  const { data: links, error: linksError } = await supabase
    .from('enterprise_parent_child')
    .select('pupil_id')
    .eq('parent_user_id', user.id)

  if (linksError) {
    throw linksError
  }

  const pupilIds = (links || []).map((item) => item.pupil_id)
  if (!pupilIds.length) {
    return {
      id: user.id,
      email: user.email,
      name: user.full_name,
      children: [],
    }
  }

  const { data: pupils, error: pupilsError } = await supabase
    .from('enterprise_pupils')
    .select('id, class_id, name, communication_goal, archived_at')
    .in('id', pupilIds)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (pupilsError) {
    throw pupilsError
  }

  const classIds = [...new Set((pupils || []).map((item) => item.class_id))]
  const { data: classes, error: classesError } = await supabase
    .from('enterprise_classes')
    .select('id, name, teacher_user_id, archived_at')
    .in('id', classIds)
    .is('archived_at', null)

  if (classesError) {
    throw classesError
  }

  const teacherIds = [...new Set((classes || []).map((item) => item.teacher_user_id))]
  const { data: teachers, error: teacherError } = await supabase
    .from('enterprise_users')
    .select('id, full_name')
    .in('id', teacherIds)

  if (teacherError) {
    throw teacherError
  }

  const classById = new Map((classes || []).map((item) => [item.id, item]))
  const teacherById = new Map((teachers || []).map((item) => [item.id, item]))

  return {
    id: user.id,
    email: user.email,
    name: user.full_name,
    children: (pupils || []).map((pupil) => {
      const classRoom = classById.get(pupil.class_id)
      const teacher = classRoom ? teacherById.get(classRoom.teacher_user_id) : null

      return {
        id: pupil.id,
        name: pupil.name,
        className: classRoom?.name || 'Unassigned class',
        communicationGoal: pupil.communication_goal,
        teacherName: teacher?.full_name || 'Unassigned teacher',
      }
    }),
  }
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

app.post('/api/enterprise/lookup', async (req, res) => {
  const role = String(req.body?.role || '').trim().toLowerCase()
  const email = normalizeEmail(req.body?.email)

  if (!enterpriseRoles.has(role) || !email) {
    return res.status(400).json({ error: 'Invalid enterprise lookup payload' })
  }

  try {
    const user = await findEnterpriseUserByEmail(role, email)
    if (!user) {
      return res.status(404).json({ error: 'Account not found' })
    }

    const profile = role === 'teacher'
      ? await buildTeacherProfile(user)
      : await buildParentProfile(user)

    return res.json({ role, profile })
  } catch (error) {
    if (isMissingEnterpriseTablesError(error)) {
      return res.status(503).json({
        error: 'Enterprise tables are not initialized. Run server/supabase.sql in Supabase SQL editor.',
      })
    }

    console.error(error)
    return res.status(500).json({ error: 'Failed to load enterprise profile' })
  }
})

app.post('/api/enterprise/classes', async (req, res) => {
  const teacherId = normalizeText(req.body?.teacherId)
  const name = normalizeText(req.body?.name)
  const grade = normalizeText(req.body?.grade)

  if (!teacherId || !name || !grade) {
    return res.status(400).json({ error: 'teacherId, name, and grade are required' })
  }

  try {
    const teacher = await findTeacherById(teacherId)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const classId = createScopedId('class')
    const { error: insertError } = await supabase.from('enterprise_classes').insert({
      id: classId,
      teacher_user_id: teacherId,
      name,
      grade,
      archived_at: null,
    })

    if (insertError) {
      throw insertError
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to create class' })
  }
})

app.patch('/api/enterprise/classes/:classId', async (req, res) => {
  const classId = normalizeText(req.params?.classId)
  const name = normalizeText(req.body?.name)
  const grade = normalizeText(req.body?.grade)

  if (!classId || !name || !grade) {
    return res.status(400).json({ error: 'classId, name, and grade are required' })
  }

  try {
    const classRoom = await findClassById(classId)
    if (!classRoom || classRoom.archived_at) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const { error: updateError } = await supabase
      .from('enterprise_classes')
      .update({ name, grade })
      .eq('id', classId)

    if (updateError) {
      throw updateError
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to update class' })
  }
})

app.post('/api/enterprise/classes/:classId/archive', async (req, res) => {
  const classId = normalizeText(req.params?.classId)

  if (!classId) {
    return res.status(400).json({ error: 'classId is required' })
  }

  try {
    const classRoom = await findClassById(classId)
    if (!classRoom || classRoom.archived_at) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const archivedAt = new Date().toISOString()

    const { error: classArchiveError } = await supabase
      .from('enterprise_classes')
      .update({ archived_at: archivedAt })
      .eq('id', classId)

    if (classArchiveError) {
      throw classArchiveError
    }

    const { error: pupilsArchiveError } = await supabase
      .from('enterprise_pupils')
      .update({ archived_at: archivedAt })
      .eq('class_id', classId)

    if (pupilsArchiveError) {
      throw pupilsArchiveError
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to archive class' })
  }
})

app.post('/api/enterprise/pupils', async (req, res) => {
  const classId = normalizeText(req.body?.classId)
  const name = normalizeText(req.body?.name)
  const communicationGoal = normalizeText(req.body?.communicationGoal)

  if (!classId || !name || !communicationGoal) {
    return res.status(400).json({ error: 'classId, name, and communicationGoal are required' })
  }

  try {
    const classRoom = await findClassById(classId)
    if (!classRoom || classRoom.archived_at) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const pupilId = createScopedId('pupil')
    const { error: insertError } = await supabase.from('enterprise_pupils').insert({
      id: pupilId,
      class_id: classId,
      name,
      communication_goal: communicationGoal,
      archived_at: null,
    })

    if (insertError) {
      throw insertError
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to create pupil' })
  }
})

app.patch('/api/enterprise/pupils/:pupilId', async (req, res) => {
  const pupilId = normalizeText(req.params?.pupilId)
  const name = normalizeText(req.body?.name)
  const communicationGoal = normalizeText(req.body?.communicationGoal)

  if (!pupilId || !name || !communicationGoal) {
    return res.status(400).json({ error: 'pupilId, name, and communicationGoal are required' })
  }

  try {
    const pupil = await findPupilById(pupilId)
    if (!pupil || pupil.archived_at) {
      return res.status(404).json({ error: 'Pupil not found' })
    }

    const { error: updateError } = await supabase
      .from('enterprise_pupils')
      .update({
        name,
        communication_goal: communicationGoal,
      })
      .eq('id', pupilId)

    if (updateError) {
      throw updateError
    }

    const classRoom = await findClassById(pupil.class_id)
    if (!classRoom) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to update pupil' })
  }
})

app.post('/api/enterprise/pupils/:pupilId/archive', async (req, res) => {
  const pupilId = normalizeText(req.params?.pupilId)

  if (!pupilId) {
    return res.status(400).json({ error: 'pupilId is required' })
  }

  try {
    const pupil = await findPupilById(pupilId)
    if (!pupil || pupil.archived_at) {
      return res.status(404).json({ error: 'Pupil not found' })
    }

    const { error: archiveError } = await supabase
      .from('enterprise_pupils')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', pupilId)

    if (archiveError) {
      throw archiveError
    }

    const classRoom = await findClassById(pupil.class_id)
    if (!classRoom) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to archive pupil' })
  }
})

app.post('/api/enterprise/pupils/:pupilId/parents', async (req, res) => {
  const pupilId = normalizeText(req.params?.pupilId)
  const email = normalizeEmail(req.body?.email)

  if (!pupilId || !email) {
    return res.status(400).json({ error: 'pupilId and email are required' })
  }

  try {
    const pupil = await findPupilById(pupilId)
    if (!pupil || pupil.archived_at) {
      return res.status(404).json({ error: 'Pupil not found' })
    }

    const classRoom = await findClassById(pupil.class_id)
    if (!classRoom || classRoom.archived_at) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const parentUser = await ensureParentUserByEmail(email)

    const { error: linkError } = await supabase
      .from('enterprise_parent_child')
      .upsert(
        {
          parent_user_id: parentUser.id,
          pupil_id: pupil.id,
        },
        { onConflict: 'parent_user_id,pupil_id' },
      )

    if (linkError) {
      throw linkError
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to link parent email' })
  }
})

app.post('/api/enterprise/pupils/:pupilId/parents/remove', async (req, res) => {
  const pupilId = normalizeText(req.params?.pupilId)
  const email = normalizeEmail(req.body?.email)

  if (!pupilId || !email) {
    return res.status(400).json({ error: 'pupilId and email are required' })
  }

  try {
    const pupil = await findPupilById(pupilId)
    if (!pupil || pupil.archived_at) {
      return res.status(404).json({ error: 'Pupil not found' })
    }

    const classRoom = await findClassById(pupil.class_id)
    if (!classRoom || classRoom.archived_at) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const parentUser = await findEnterpriseUserByEmail('parent', email)
    if (parentUser) {
      const { error: unlinkError } = await supabase
        .from('enterprise_parent_child')
        .delete()
        .eq('parent_user_id', parentUser.id)
        .eq('pupil_id', pupil.id)

      if (unlinkError) {
        throw unlinkError
      }
    }

    const teacher = await findTeacherById(classRoom.teacher_user_id)
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const profile = await buildTeacherProfile(teacher)
    return res.json({ ok: true, profile })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to unlink parent email' })
  }
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
