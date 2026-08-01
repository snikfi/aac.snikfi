import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearAdminSession,
  fetchRemoteTileConfig,
  hasAdminSession,
  isRemoteSyncEnabled,
  saveRemoteTileConfig,
  unlockAdminSession,
} from './lib/tileConfigSync'
import './App.css'

const STORAGE_KEY = 'arti-aac-tiles-v1'
const ADMIN_PIN_MAX_LENGTH = 8
const ADMIN_UNLOCK_MAX_ATTEMPTS_FALLBACK = 5
const ADMIN_UNLOCK_LOCKOUT_MINUTES_FALLBACK = 15

function formatDurationLabel(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const DEFAULT_SUBJECTS = []

const DEFAULT_VERBS = []

const QUICK_WORDS = [
  {
    id: 'no',
    label: 'no',
    image: 'http://localhost:3845/assets/3156fb76f3b5f08305b2d3db466f61938ec7ace4.png',
  },
  {
    id: 'love',
    label: 'love',
    image: 'http://localhost:3845/assets/fe6cef933266d50b8767ea2a886aa27229eba6e0.png',
  },
  {
    id: 'stop',
    label: 'stop',
    image: 'http://localhost:3845/assets/a6bc08c5207b61db065e638391a8cbd5e74d37cb.png',
  },
  {
    id: 'happy',
    label: 'happy',
    image: 'http://localhost:3845/assets/9c348e136b680ed7e15dd024cdbc4fa34707b56d.png',
  },
  {
    id: 'angry',
    label: 'angry',
    image: 'http://localhost:3845/assets/dbb3139a29bca52a20ff0e9fc430474beeb65a3c.png',
  },
]

function makeBadgeImage(label, backgroundColor, foregroundColor = '#060606') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
      <rect width="128" height="128" rx="24" fill="${backgroundColor}"/>
      <text x="64" y="68" text-anchor="middle" font-family="Lato, Arial, sans-serif" font-size="18" font-weight="700" fill="${foregroundColor}">${label}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const DEFAULT_OBJECTS_BY_VERB = {}

function cloneDefaults() {
  return {
    subjects: structuredClone(DEFAULT_SUBJECTS),
    verbs: structuredClone(DEFAULT_VERBS),
    objectsByVerb: structuredClone(DEFAULT_OBJECTS_BY_VERB),
  }
}

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

function loadTileConfig() {
  const defaults = cloneDefaults()

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return defaults
    }

    const parsed = JSON.parse(stored)
    if (!isValidTileConfig(parsed)) {
      return defaults
    }

    return {
      subjects: parsed.subjects,
      verbs: parsed.verbs,
      objectsByVerb: parsed.objectsByVerb,
    }
  } catch {
    return defaults
  }
}

function toTileId(label) {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `${base || 'tile'}-${Date.now()}`
}

function moveItem(list, index, direction) {
  const next = [...list]
  const target = index + direction

  if (target < 0 || target >= next.length) {
    return next
  }

  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function speakText(text) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
    return
  }

  const trimmedText = text.trim()
  const normalizedText = /^[A-Za-z]$/.test(trimmedText)
    ? trimmedText.toLowerCase()
    : text

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(normalizedText)
  utterance.rate = 0.9
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

function enhanceSentence(subject, verb, objectWord) {
  if (!subject || !verb) {
    return ''
  }

  const spokenObject = objectWord?.spoken || objectWord?.label?.toLowerCase()

  if (!spokenObject) {
    return `${subject.label} ${verb.label.toLowerCase()}.`
  }

  return `${subject.label} ${verb.label.toLowerCase()} ${spokenObject}.`
}

function formatBackupTimestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') +
    '_' +
    [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('-')
}

function App() {
  const initialConfig = useMemo(() => loadTileConfig(), [])

  const [subjects, setSubjects] = useState(initialConfig.subjects)
  const [verbs, setVerbs] = useState(initialConfig.verbs)
  const [objectsByVerb, setObjectsByVerb] = useState(initialConfig.objectsByVerb)

  const [subject, setSubject] = useState(null)
  const [verb, setVerb] = useState(null)
  const [objectWord, setObjectWord] = useState(null)
  const [lastSpoken, setLastSpoken] = useState('')

  const [isPinOpen, setIsPinOpen] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [isUnlockingAdmin, setIsUnlockingAdmin] = useState(false)
  const [hasAdminAuth, setHasAdminAuth] = useState(() => hasAdminSession())
  const [adminSessionExpiresAt, setAdminSessionExpiresAt] = useState(null)
  const [adminUnlockLockedUntil, setAdminUnlockLockedUntil] = useState(null)
  const [adminFailedAttempts, setAdminFailedAttempts] = useState(0)
  const [timeNow, setTimeNow] = useState(() => Date.now())
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [adminTab, setAdminTab] = useState('subject')

  const [objectVerbId, setObjectVerbId] = useState(verbs[0]?.id || '')
  const [newTileName, setNewTileName] = useState('')
  const [newTileImage, setNewTileImage] = useState('')
  const [syncState, setSyncState] = useState(
    isRemoteSyncEnabled() ? 'connecting' : 'local-only',
  )
  const [isSyncTipOpen, setIsSyncTipOpen] = useState(false)
  const syncTipRef = useRef(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [hasHydratedSync, setHasHydratedSync] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [exportNotice, setExportNotice] = useState(null)
  const [restoreDraft, setRestoreDraft] = useState(null)
  const [deleteDraft, setDeleteDraft] = useState(null)
  const [deletedToasts, setDeletedToasts] = useState([])
  const [createdToasts, setCreatedToasts] = useState([])
  const [dragState, setDragState] = useState({
    active: false,
    scope: '',
    fromIndex: -1,
    overIndex: -1,
  })

  const adminLockoutRemainingMs = adminUnlockLockedUntil
    ? Math.max(0, adminUnlockLockedUntil - timeNow)
    : 0
  const isAdminUnlockLocked = adminLockoutRemainingMs > 0

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const payload = JSON.stringify({ subjects, verbs, objectsByVerb })
    window.localStorage.setItem(STORAGE_KEY, payload)
  }, [subjects, verbs, objectsByVerb])

  useEffect(() => {
    let isCanceled = false

    const syncFromRemote = async () => {
      if (!isRemoteSyncEnabled()) {
        setHasHydratedSync(true)
        return
      }

      try {
        const remoteConfig = await fetchRemoteTileConfig()

        if (isCanceled) {
          return
        }

        if (isValidTileConfig(remoteConfig)) {
          setSubjects(remoteConfig.subjects)
          setVerbs(remoteConfig.verbs)
          setObjectsByVerb(remoteConfig.objectsByVerb)
        }

        setLastSyncedAt(new Date())
        setSyncState('synced')
      } catch {
        if (!isCanceled) {
          setSyncState('error')
        }
      } finally {
        if (!isCanceled) {
          setHasHydratedSync(true)
        }
      }
    }

    syncFromRemote()

    return () => {
      isCanceled = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedSync || !isRemoteSyncEnabled() || !hasAdminAuth) {
      return
    }

    const payload = { subjects, verbs, objectsByVerb }
    setSyncState('saving')

    const timeoutId = window.setTimeout(() => {
      saveRemoteTileConfig(payload)
        .then(() => {
          setLastSyncedAt(new Date())
          setSyncState('synced')
        })
        .catch((error) => {
          if (error instanceof Error && error.message === 'Admin session expired') {
            setHasAdminAuth(false)
            setAdminSessionExpiresAt(null)
            setIsAdminOpen(false)
            setIsPinOpen(true)
            setPinInput('')
            setPinError('Session expired. Enter admin code again.')
          }

          setSyncState('error')
        })
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [subjects, verbs, objectsByVerb, hasHydratedSync, hasAdminAuth])

  useEffect(() => {
    if (!isSyncTipOpen) {
      return undefined
    }

    const onPointerDown = (event) => {
      const root = syncTipRef.current
      if (!root) {
        return
      }

      if (!root.contains(event.target)) {
        setIsSyncTipOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSyncTipOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isSyncTipOpen])

  useEffect(() => {
    if (verb && !verbs.some((item) => item.id === verb.id)) {
      setVerb(null)
      setObjectWord(null)
    }
  }, [verb, verbs])

  useEffect(() => {
    if (subject && !subjects.some((item) => item.id === subject.id)) {
      setSubject(null)
      setVerb(null)
      setObjectWord(null)
    }
  }, [subject, subjects])

  useEffect(() => {
    if (!verbs.length) {
      setObjectVerbId('')
      return
    }

    if (!objectVerbId || !verbs.some((item) => item.id === objectVerbId)) {
      setObjectVerbId(verbs[0].id)
    }
  }, [verbs, objectVerbId])

  useEffect(() => {
    if (!dragState.active) {
      return undefined
    }

    const onPointerMove = (event) => {
      const element = document.elementFromPoint(event.clientX, event.clientY)
      const item = element?.closest('[data-admin-item-index]')

      if (!item) {
        return
      }

      const targetIndex = Number(item.getAttribute('data-admin-item-index'))
      if (Number.isNaN(targetIndex)) {
        return
      }

      setDragState((current) =>
        current.overIndex === targetIndex ? current : { ...current, overIndex: targetIndex },
      )
    }

    const onPointerEnd = () => {
      setDragState((current) => {
        if (!current.active) {
          return current
        }

        if (
          current.scope &&
          current.fromIndex >= 0 &&
          current.overIndex >= 0 &&
          current.fromIndex !== current.overIndex
        ) {
          onMoveTileToIndex(current.scope, current.fromIndex, current.overIndex)
        }

        return { active: false, scope: '', fromIndex: -1, overIndex: -1 }
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [dragState.active])

  useEffect(() => {
    if (!isPinOpen && !hasAdminAuth && !adminUnlockLockedUntil) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setTimeNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isPinOpen, hasAdminAuth, adminUnlockLockedUntil])

  useEffect(() => {
    if (!adminUnlockLockedUntil || adminUnlockLockedUntil > timeNow) {
      return
    }

    setAdminUnlockLockedUntil(null)
    setAdminFailedAttempts(0)
  }, [adminUnlockLockedUntil, timeNow])

  useEffect(() => {
    if (!hasAdminAuth || !adminSessionExpiresAt || adminSessionExpiresAt > timeNow) {
      return
    }

    clearAdminSession()
    setHasAdminAuth(false)
    setAdminSessionExpiresAt(null)

    if (isAdminOpen) {
      setIsAdminOpen(false)
      setIsPinOpen(true)
      setPinInput('')
      setPinError('Session expired. Enter admin code again.')
    }
  }, [adminSessionExpiresAt, hasAdminAuth, isAdminOpen, timeNow])

  useEffect(() => {
    if (!isPinOpen || isUnlockingAdmin) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault()
        onAppendPinDigit(event.key)
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        onDeletePinDigit()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onClearPin()
        return
      }

      if (event.key === 'Enter' && pinInput) {
        event.preventDefault()
        onSubmitPin()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isPinOpen, isUnlockingAdmin, pinInput, isAdminUnlockLocked])

  const objectOptions = useMemo(() => {
    if (!verb) {
      return []
    }

    return objectsByVerb[verb.id] || []
  }, [verb, objectsByVerb])

  const adminObjectTiles = useMemo(() => {
    if (!objectVerbId) {
      return []
    }

    return objectsByVerb[objectVerbId] || []
  }, [objectsByVerb, objectVerbId])

  const sentencePreview = useMemo(() => {
    return [subject?.label, verb?.label, objectWord?.label]
      .filter(Boolean)
      .join('  •  ')
  }, [subject, verb, objectWord])

  const tileConfig = useMemo(
    () => ({ subjects, verbs, objectsByVerb }),
    [subjects, verbs, objectsByVerb],
  )

  const syncMessage = useMemo(() => {
    if (syncState === 'local-only') {
      return 'Saved on this device'
    }

    if (syncState === 'connecting') {
      return 'Connecting...'
    }

    if (syncState === 'saving') {
      return 'Saving...'
    }

    if (syncState === 'synced') {
      return 'Saved for all devices'
    }

    return 'Cloud sync unavailable'
  }, [syncState])

  const syncTone = useMemo(() => {
    return syncState === 'error' || syncState === 'local-only' ? 'error' : 'ok'
  }, [syncState])

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt || typeof Intl === 'undefined') {
      return ''
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(lastSyncedAt)
  }, [lastSyncedAt])

  const syncDetailMessage = useMemo(() => {
    if (!isRemoteSyncEnabled()) {
      return 'Cloud sync disabled'
    }

    if (lastSyncedLabel) {
      return `Last synced ${lastSyncedLabel}`
    }

    if (syncState === 'connecting' || syncState === 'saving') {
      return 'Sync in progress'
    }

    if (syncState === 'error') {
      return 'Last sync failed'
    }

    return 'Waiting for first sync'
  }, [lastSyncedLabel, syncState])

  const adminSessionExpiresLabel = useMemo(() => {
    if (!adminSessionExpiresAt || typeof Intl === 'undefined') {
      return ''
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(adminSessionExpiresAt)
  }, [adminSessionExpiresAt])

  const adminStatusMessage = useMemo(() => {
    if (hasAdminAuth && adminSessionExpiresLabel) {
      return `Unlocked until ${adminSessionExpiresLabel}`
    }

    if (hasAdminAuth) {
      return 'Unlocked'
    }

    return 'Locked'
  }, [adminSessionExpiresLabel, hasAdminAuth])

  const localAttemptsRemaining = Math.max(
    0,
    ADMIN_UNLOCK_MAX_ATTEMPTS_FALLBACK - adminFailedAttempts,
  )

  const topSelections = useMemo(
    () => [
      {
        id: 'subject',
        tone: 'subject',
        label: subject?.label || 'Subject',
        image: subject?.image || null,
      },
      {
        id: 'verb',
        tone: 'verb',
        label: verb?.label || 'Verb',
        image: verb?.image || null,
      },
      {
        id: 'object',
        tone: 'object',
        label: objectWord?.label || 'Object',
        image: objectWord?.image || null,
      },
    ],
    [subject, verb, objectWord],
  )

  const onSelectSubject = (item) => {
    setSubject(item)
    setVerb(null)
    setObjectWord(null)
    speakText(item.label)
    setLastSpoken(item.label)
  }

  const onOpenPin = () => {
    if (hasAdminAuth) {
      setPinError('')
      setIsAdminOpen(true)
      return
    }

    setPinInput('')
    setPinError('')
    setIsPinOpen(true)
  }

  const onAppendPinDigit = (digit) => {
    if (isAdminUnlockLocked) {
      return
    }

    setPinError('')
    setPinInput((current) => {
      if (current.length >= ADMIN_PIN_MAX_LENGTH) {
        return current
      }

      return `${current}${digit}`
    })
  }

  const onDeletePinDigit = () => {
    if (isAdminUnlockLocked) {
      return
    }

    setPinError('')
    setPinInput((current) => current.slice(0, -1))
  }

  const onClearPin = () => {
    if (isAdminUnlockLocked) {
      return
    }

    setPinError('')
    setPinInput('')
  }

  const onSubmitPin = async () => {
    if (isAdminUnlockLocked) {
      return
    }

    const pin = pinInput.trim()
    if (!pin) {
      setPinError('Enter admin code')
      return
    }

    setPinError('')
    setIsUnlockingAdmin(true)

    try {
      const session = await unlockAdminSession(pin)
      setHasAdminAuth(true)
      setAdminSessionExpiresAt(Date.now() + (session.expiresInSeconds || 0) * 1000)
      setAdminUnlockLockedUntil(null)
      setAdminFailedAttempts(0)
      setIsPinOpen(false)
      setIsAdminOpen(true)
      setPinInput('')
    } catch (error) {
      if (error instanceof Error && error.code === 'INVALID_ADMIN_CODE') {
        if (typeof error.attemptsRemaining === 'number') {
          setAdminFailedAttempts(Math.max(0, ADMIN_UNLOCK_MAX_ATTEMPTS_FALLBACK - error.attemptsRemaining))
          const triesLabel = error.attemptsRemaining === 1 ? 'try' : 'tries'
          setPinError(`Incorrect code. ${error.attemptsRemaining} ${triesLabel} left.`)
          setPinInput('')
        } else {
          const nextAttempts = adminFailedAttempts + 1
          setAdminFailedAttempts(nextAttempts)
          setPinInput('')

          if (nextAttempts >= ADMIN_UNLOCK_MAX_ATTEMPTS_FALLBACK) {
            setAdminUnlockLockedUntil(
              Date.now() + ADMIN_UNLOCK_LOCKOUT_MINUTES_FALLBACK * 60 * 1000,
            )
            setPinError('Too many attempts.')
          } else {
            const attemptsRemaining = ADMIN_UNLOCK_MAX_ATTEMPTS_FALLBACK - nextAttempts
            const triesLabel = attemptsRemaining === 1 ? 'try' : 'tries'
            setPinError(`Incorrect code. ${attemptsRemaining} ${triesLabel} left.`)
          }
        }
      } else if (error instanceof Error && error.code === 'ADMIN_UNLOCK_LOCKED') {
        const retryAfterSeconds = Math.max(1, Number(error.retryAfterSeconds || 0))
        setAdminUnlockLockedUntil(Date.now() + retryAfterSeconds * 1000)
        setPinError('Too many attempts.')
        setPinInput('')
      } else {
        setPinError('Could not verify code. Try again.')
      }
    } finally {
      setIsUnlockingAdmin(false)
    }
  }

  const onCloseAdmin = () => {
    setIsAdminOpen(false)
    setAdminTab('subject')
    setRestoreDraft(null)
    setExportNotice(null)
    setDeleteDraft(null)
    setBackupStatus('')
    setDeletedToasts([])
    setCreatedToasts([])
  }

  const onLockAdmin = () => {
    clearAdminSession()
    setHasAdminAuth(false)
    setAdminSessionExpiresAt(null)
    setPinInput('')
    setPinError('')
    onCloseAdmin()
  }

  const createDeletedToast = (payload) => {
    return {
      undoId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...payload,
    }
  }

  const addCreatedToast = (message) => {
    const toastId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    setCreatedToasts((current) => [...current, { toastId, message }])

    window.setTimeout(() => {
      setCreatedToasts((current) => current.filter((toast) => toast.toastId !== toastId))
    }, 3000)
  }

  const createNewTile = (label, image) => {
    return {
      id: toTileId(label),
      label,
      image: image || makeBadgeImage(label, '#fafdd9'),
    }
  }

  const onAddTile = () => {
    const label = newTileName.trim()
    if (!label) {
      return
    }

    const tile = createNewTile(label, newTileImage.trim())

    if (adminTab === 'subject') {
      setSubjects((current) => [...current, tile])
    } else if (adminTab === 'verb') {
      setVerbs((current) => [...current, tile])
      setObjectsByVerb((current) => ({ ...current, [tile.id]: [] }))
      if (!objectVerbId) {
        setObjectVerbId(tile.id)
      }
    } else if (adminTab === 'object' && objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: [...(current[objectVerbId] || []), tile],
      }))
    }

    addCreatedToast(`Added "${label}".`)
    setNewTileName('')
    setNewTileImage('')
  }

  const onEditTile = (scope, id, field, value) => {
    if (scope === 'subject') {
      setSubjects((current) =>
        current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      )
      return
    }

    if (scope === 'verb') {
      setVerbs((current) =>
        current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      )
      return
    }

    if (scope === 'object' && objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: (current[objectVerbId] || []).map((item) =>
          item.id === id ? { ...item, [field]: value } : item,
        ),
      }))
    }
  }

  const onReorderTile = (scope, index, direction) => {
    if (scope === 'subject') {
      setSubjects((current) => moveItem(current, index, direction))
      return
    }

    if (scope === 'verb') {
      setVerbs((current) => moveItem(current, index, direction))
      return
    }

    if (scope === 'object' && objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: moveItem(current[objectVerbId] || [], index, direction),
      }))
    }
  }

  const onMoveTileToIndex = (scope, fromIndex, toIndex) => {
    const moveTo = (list) => {
      const next = [...list]
      const [tile] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, tile)
      return next
    }

    if (scope === 'subject') {
      setSubjects((current) => moveTo(current))
      return
    }

    if (scope === 'verb') {
      setVerbs((current) => moveTo(current))
      return
    }

    if (scope === 'object' && objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: moveTo(current[objectVerbId] || []),
      }))
    }
  }

  const onStartDragTile = (scope, index, event) => {
    event.preventDefault()
    setDragState({ active: true, scope, fromIndex: index, overIndex: index })
  }

  const onRequestDeleteTile = (scope, tile, index) => {
    setExportNotice(null)
    setRestoreDraft(null)
    setDeleteDraft({ scope, tile, index })
  }

  const onCancelDeleteTile = () => {
    setDeleteDraft(null)
  }

  const onConfirmDeleteTile = () => {
    if (!deleteDraft) {
      return
    }

    const { scope, tile, index } = deleteDraft
    setDeleteDraft(null)

    if (scope === 'subject') {
      setDeletedToasts((current) => [...current, createDeletedToast({ scope, tile, index })])
      setSubjects((current) => current.filter((item) => item.id !== tile.id))
      return
    }

    if (scope === 'verb') {
      setDeletedToasts((current) => [
        ...current,
        createDeletedToast({
          scope,
          tile,
          index,
          objectsForVerb: structuredClone(objectsByVerb[tile.id] || []),
        }),
      ])
      setVerbs((current) => current.filter((item) => item.id !== tile.id))
      setObjectsByVerb((current) => {
        const next = { ...current }
        delete next[tile.id]
        return next
      })
      return
    }

    if (scope === 'object' && objectVerbId) {
      setDeletedToasts((current) => [
        ...current,
        createDeletedToast({ scope, tile, index, objectVerbId }),
      ])
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: (current[objectVerbId] || []).filter((item) => item.id !== tile.id),
      }))
    }
  }

  const onDuplicateTile = (scope, tile, index) => {
    const duplicate = {
      ...structuredClone(tile),
      id: toTileId(tile.label),
      label: `${tile.label} copy`,
    }

    if (scope === 'subject') {
      setSubjects((current) => {
        const next = [...current]
        next.splice(index + 1, 0, duplicate)
        return next
      })
      return
    }

    if (scope === 'verb') {
      setVerbs((current) => {
        const next = [...current]
        next.splice(index + 1, 0, duplicate)
        return next
      })

      setObjectsByVerb((current) => ({
        ...current,
        [duplicate.id]: structuredClone(current[tile.id] || []),
      }))
      return
    }

    if (scope === 'object' && objectVerbId) {
      setObjectsByVerb((current) => {
        const next = [...(current[objectVerbId] || [])]
        next.splice(index + 1, 0, duplicate)
        return {
          ...current,
          [objectVerbId]: next,
        }
      })
    }
  }

  const onUndoDelete = (undoId) => {
    const deletedItem = deletedToasts.find((toast) => toast.undoId === undoId)

    if (!deletedItem) {
      return
    }

    const insertAt = (list, restoredTile, restoredIndex) => {
      const next = [...list]
      const safeIndex = Math.max(0, Math.min(restoredIndex, next.length))
      next.splice(safeIndex, 0, restoredTile)
      return next
    }

    if (deletedItem.scope === 'subject') {
      setSubjects((current) => insertAt(current, deletedItem.tile, deletedItem.index))
      setDeletedToasts((current) => current.filter((toast) => toast.undoId !== undoId))
      return
    }

    if (deletedItem.scope === 'verb') {
      setVerbs((current) => insertAt(current, deletedItem.tile, deletedItem.index))
      setObjectsByVerb((current) => ({
        ...current,
        [deletedItem.tile.id]: structuredClone(deletedItem.objectsForVerb || []),
      }))
      setDeletedToasts((current) => current.filter((toast) => toast.undoId !== undoId))
      return
    }

    if (deletedItem.scope === 'object' && deletedItem.objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [deletedItem.objectVerbId]: insertAt(
          current[deletedItem.objectVerbId] || [],
          deletedItem.tile,
          deletedItem.index,
        ),
      }))
      setDeletedToasts((current) => current.filter((toast) => toast.undoId !== undoId))
    }
  }

  const onUploadTileImage = async (scope, id, file) => {
    if (!file) {
      return
    }

    try {
      const image = await readFileAsDataUrl(file)
      onEditTile(scope, id, 'image', image)
    } catch {
      // Ignore read errors so the UI remains responsive for the user.
    }
  }

  const onUploadNewTileImage = async (file) => {
    if (!file) {
      return
    }

    try {
      const image = await readFileAsDataUrl(file)
      setNewTileImage(image)
    } catch {
      // Ignore read errors so the UI remains responsive for the user.
    }
  }

  const onExportBackup = async () => {
    if (typeof window === 'undefined') {
      return
    }

    const timestamp = formatBackupTimestamp()
    const backupFileName = `arti-tiles-backup-${timestamp}.json`
    const content = JSON.stringify(tileConfig, null, 2)
    const supportsFilePicker = typeof window.showSaveFilePicker === 'function'

    if (supportsFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: backupFileName,
          types: [
            {
              description: 'JSON backup',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        })

        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()

        setRestoreDraft(null)
        setDeleteDraft(null)
        setExportNotice({
          title: 'Backup exported',
          message: `Your backup file is ready: ${handle.name || backupFileName}`,
        })
        setBackupStatus('')
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setBackupStatus('Could not export backup.')
        }
      }

      return
    }

    // Fallback for browsers without the file picker API. Download starts, but save/cancel outcome is not observable.
    const blob = new Blob([content], { type: 'application/json' })
    const objectUrl = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = objectUrl
    anchor.download = backupFileName
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(objectUrl)
    setRestoreDraft(null)
    setDeleteDraft(null)
    setExportNotice({
      title: 'Backup download started',
      message: `Your browser started downloading ${backupFileName}. Check your Downloads folder.`,
    })
    setBackupStatus('')
  }

  const onCloseExportNotice = () => {
    setExportNotice(null)
  }

  const onRestoreBackup = async (file) => {
    if (!file) {
      return
    }

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)

      if (!isValidTileConfig(parsed)) {
        setBackupStatus('Invalid backup file.')
        return
      }

      setExportNotice(null)
      setDeleteDraft(null)
      setRestoreDraft({
        fileName: file.name || 'backup file',
        config: parsed,
      })
      setBackupStatus('Backup loaded. Confirm restore below.')
    } catch {
      setBackupStatus('Could not restore backup.')
    }
  }

  const onConfirmRestore = () => {
    if (!restoreDraft) {
      return
    }

    setSubjects(restoreDraft.config.subjects)
    setVerbs(restoreDraft.config.verbs)
    setObjectsByVerb(restoreDraft.config.objectsByVerb)
    setSubject(null)
    setVerb(null)
    setObjectWord(null)
    setLastSpoken('')
    setRestoreDraft(null)
    setBackupStatus('Backup restored.')
  }

  const onCancelRestore = () => {
    setRestoreDraft(null)
    setBackupStatus('Restore canceled.')
  }

  const adminTiles =
    adminTab === 'subject' ? subjects : adminTab === 'verb' ? verbs : adminObjectTiles

  const mobileStepClass = !subject ? 'step-subject' : !verb ? 'step-verb' : 'step-object'

  const onSelectVerb = (item) => {
    setVerb(item)
    setObjectWord(null)

    if (subject) {
      const phrase = `${subject.label} ${item.label.toLowerCase()}`
      speakText(phrase)
      setLastSpoken(phrase)
      return
    }

    speakText(item.label)
    setLastSpoken(item.label)
  }

  const onSelectObject = (item) => {
    setObjectWord(item)
    const phrase = enhanceSentence(subject, verb, item)
    speakText(phrase)
    setLastSpoken(phrase)
  }

  const onQuickWord = (item) => {
    speakText(item.label)
    setLastSpoken(item.label)
  }

  const onRestart = () => {
    setSubject(null)
    setVerb(null)
    setObjectWord(null)
    setLastSpoken('')
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }

  const onRepeat = () => {
    const sentence = enhanceSentence(subject, verb, objectWord)
    const fallback = sentencePreview.replaceAll('  •  ', ' ')
    speakText(lastSpoken || sentence || fallback)
  }

  const onBackspace = () => {
    if (objectWord) {
      setObjectWord(null)
      return
    }

    if (verb) {
      setVerb(null)
      setObjectWord(null)
      return
    }

    if (subject) {
      setSubject(null)
      setVerb(null)
      setObjectWord(null)
    }
  }

  return (
    <main className="figma-shell" data-node-id="1:59">
      <header className="top-strip">
        <div className="top-left-group">
          <div className="top-left">
            {topSelections.map((item) => (
              <div
                key={item.id}
                className={`top-selection-chip ${item.image ? `filled tone-${item.tone}` : 'empty'}`}
                aria-label={`${item.id} selection: ${item.label}`}
              >
                {item.image ? (
                  <img src={item.image} alt="" aria-hidden="true" loading="lazy" />
                ) : (
                  <div className="chip-placeholder" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="top-backspace"
            onClick={onBackspace}
            aria-label="Backspace one step"
            disabled={!subject && !verb && !objectWord}
          >
            <span className="backspace-icon">⌫</span>
          </button>
        </div>
        <div className="top-controls">
          <button type="button" className="control-btn" onClick={onRepeat}>
            <span className="control-icon">🔊</span>
            <span>Play</span>
          </button>
          <button type="button" className="control-btn" onClick={onRestart}>
            <span className="control-icon">↻</span>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <section className={`board-layout ${mobileStepClass}`} aria-label="AAC communication grid">
        <aside className="side-rail" aria-label="quick words">
          {QUICK_WORDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="side-tile"
              onClick={() => onQuickWord(item)}
            >
              <img src={item.image} alt="" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
          <div className="side-rail-bottom">
            <button
              ref={syncTipRef}
              type="button"
              className={`sync-rail-btn tone-${syncTone} ${isSyncTipOpen ? 'open' : ''}`}
              aria-label={syncMessage}
              aria-live="polite"
              aria-expanded={isSyncTipOpen}
              onClick={() => setIsSyncTipOpen((current) => !current)}
            >
              <span className="sync-rail-icon" aria-hidden="true">
                {syncTone === 'ok' ? '☁︎' : '⚠'}
              </span>
              <span className="sync-rail-tooltip" role="status">
                <span className="sync-tip-title">{syncMessage}</span>
                <span className="sync-tip-time">{syncDetailMessage}</span>
              </span>
            </button>
            <button
              type="button"
              className={`lock-tile ${hasAdminAuth ? 'unlocked' : ''}`}
              aria-label={hasAdminAuth ? 'Admin unlocked' : 'Admin locked'}
              onClick={onOpenPin}
            >
              <span className="lock-tile-icon" aria-hidden="true">
                {hasAdminAuth ? '🔓' : '🔒'}
              </span>
              <span className="lock-tile-label">{hasAdminAuth ? 'admin on' : 'admin'}</span>
            </button>
          </div>
        </aside>

        <article className="subject-panel">
          <div className="subject-grid">
            {subjects.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`subject-tile ${subject?.id === item.id ? 'selected' : ''}`}
                onClick={() => onSelectSubject(item)}
              >
                <img src={item.image} alt="" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </article>

        <article className={`verb-column ${subject ? 'active' : 'empty'}`} aria-label="Verb column">
          {subject && (
            <div className="verb-grid">
              {verbs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`verb-tile ${verb?.id === item.id ? 'selected' : ''}`}
                  onClick={() => onSelectVerb(item)}
                >
                  <img src={item.image} alt="" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className={`object-column ${verb ? 'active' : 'empty'}`} aria-label="Object column">
          {verb && (
            <div className="object-grid">
              {objectOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ghost-tile ${objectWord?.id === item.id ? 'selected' : ''}`}
                  onClick={() => onSelectObject(item)}
                >
                  <img src={item.image} alt="" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      {isPinOpen && (
        <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Admin code">
          <div className="admin-pin-card">
            <h2>Enter admin code</h2>
            <div className="admin-pin-display" aria-live="polite" aria-label={`Code length ${pinInput.length} of ${ADMIN_PIN_MAX_LENGTH}`}>
              {pinInput ? '●'.repeat(pinInput.length) : 'Enter code'}
            </div>
            <div className="admin-pin-pad" aria-label="Admin code keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className="admin-pin-key"
                  onClick={() => onAppendPinDigit(digit)}
                  disabled={isAdminUnlockLocked}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="admin-pin-key admin-pin-key-alt"
                onClick={onClearPin}
                disabled={!pinInput || isAdminUnlockLocked}
              >
                Clear
              </button>
              <button
                type="button"
                className="admin-pin-key"
                onClick={() => onAppendPinDigit('0')}
                disabled={isAdminUnlockLocked}
              >
                0
              </button>
              <button
                type="button"
                className="admin-pin-key admin-pin-key-alt"
                onClick={onDeletePinDigit}
                disabled={!pinInput || isAdminUnlockLocked}
              >
                Delete
              </button>
            </div>
            {pinError && <p className="admin-error">{pinError}</p>}
            {isAdminUnlockLocked && (
              <p className="admin-pin-status" role="status" aria-live="polite">
                Try again in {formatDurationLabel(adminLockoutRemainingMs)}.
              </p>
            )}
            {!isAdminUnlockLocked && adminFailedAttempts > 0 && localAttemptsRemaining > 0 && (
              <p className="admin-pin-status" role="status" aria-live="polite">
                {localAttemptsRemaining} {localAttemptsRemaining === 1 ? 'try' : 'tries'} remaining.
              </p>
            )}
            <div className="admin-pin-actions">
              <button type="button" className="admin-btn" onClick={onSubmitPin} disabled={isUnlockingAdmin || !pinInput || isAdminUnlockLocked}>
                {isUnlockingAdmin ? 'Unlocking...' : 'Unlock'}
              </button>
              <button type="button" className="admin-btn ghost" onClick={() => setIsPinOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdminOpen && (
        <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Tile admin">
          <section className="admin-panel">
            <header className="admin-header">
              <div>
                <h2>Tile Admin</h2>
                <p className="admin-session-status">{adminStatusMessage}</p>
              </div>
              <div className="admin-header-actions">
                <button type="button" className="admin-btn ghost" onClick={onExportBackup}>
                  Export backup
                </button>
                <label className="admin-btn ghost admin-file-btn">
                  Restore backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      onRestoreBackup(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
                <button type="button" className="admin-btn ghost" onClick={onLockAdmin}>
                  Lock admin
                </button>
                <button type="button" className="admin-btn ghost" onClick={onCloseAdmin}>
                  Close
                </button>
              </div>
            </header>

            {backupStatus && (
              <p className="admin-backup-status" role="status" aria-live="polite">
                {backupStatus}
              </p>
            )}

            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab ${adminTab === 'subject' ? 'active' : ''}`}
                onClick={() => setAdminTab('subject')}
              >
                Subject
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'verb' ? 'active' : ''}`}
                onClick={() => setAdminTab('verb')}
              >
                Verb
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'object' ? 'active' : ''}`}
                onClick={() => setAdminTab('object')}
              >
                Object
              </button>
            </div>

            {adminTab === 'object' && (
              <label className="admin-row">
                <span>Object set for verb</span>
                <select
                  value={objectVerbId}
                  onChange={(event) => setObjectVerbId(event.target.value)}
                >
                  {verbs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="admin-create">
              <input
                type="text"
                value={newTileName}
                onChange={(event) => setNewTileName(event.target.value)}
                placeholder="Tile name"
              />
              <input
                type="text"
                value={newTileImage}
                onChange={(event) => setNewTileImage(event.target.value)}
                placeholder="Image URL (optional)"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onUploadNewTileImage(event.target.files?.[0])}
              />
              <button type="button" className="admin-btn" onClick={onAddTile}>
                Add tile
              </button>
            </div>

            <div className="admin-list">
              {adminTiles.map((item, index) => (
                <article
                  key={item.id}
                  className={`admin-item ${
                    dragState.active && dragState.fromIndex === index && dragState.scope === adminTab
                      ? 'dragging'
                      : ''
                  } ${
                    dragState.active && dragState.overIndex === index && dragState.scope === adminTab
                      ? 'drop-target'
                      : ''
                  }`}
                  data-admin-item-index={index}
                >
                  <div className="admin-item-media">
                    <img src={item.image} alt="" aria-hidden="true" />
                    <button
                      type="button"
                      className="admin-media-btn admin-media-drag admin-drag-handle"
                      onPointerDown={(event) => onStartDragTile(adminTab, index, event)}
                      aria-label={`Drag to reorder ${item.label}`}
                    >
                      ↕
                    </button>
                    <button
                      type="button"
                      className="admin-media-btn admin-media-delete"
                      onClick={() => onRequestDeleteTile(adminTab, item, index)}
                      aria-label={`Delete ${item.label}`}
                    >
                      <svg
                        className="admin-media-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          d="M9 3h6m-8 3h10m-1 0-.7 12.2A2 2 0 0 1 13.3 20h-2.6a2 2 0 0 1-2-1.8L8 6m3 4v6m2-6v6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="admin-item-fields">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(event) =>
                        onEditTile(adminTab, item.id, 'label', event.target.value)
                      }
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        onUploadTileImage(adminTab, item.id, event.target.files?.[0])
                      }
                    />
                  </div>
                  <div className="admin-item-actions">
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onReorderTile(adminTab, index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onReorderTile(adminTab, index, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onDuplicateTile(adminTab, item, index)}
                    >
                      Duplicate
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {(deletedToasts.length > 0 || createdToasts.length > 0) && (
            <div className="admin-undo-toast-stack" aria-live="polite">
              {createdToasts.map((toast) => (
                <div key={toast.toastId} className="admin-undo-toast admin-toast-success" role="status">
                  <span>{toast.message}</span>
                </div>
              ))}

              {deletedToasts.map((toast) => (
                <div key={toast.undoId} className="admin-undo-toast" role="status">
                  <span>
                    Deleted &quot;{toast.tile.label}&quot;.
                  </span>
                  <button
                    type="button"
                    className="admin-btn ghost"
                    onClick={() => onUndoDelete(toast.undoId)}
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}

          {exportNotice && !restoreDraft && !deleteDraft && (
            <>
              <div
                className="admin-export-backdrop"
                onClick={onCloseExportNotice}
                aria-hidden="true"
              >
                <div
                  className="admin-export-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Backup exported"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3>{exportNotice.title}</h3>
                  <p>
                    <strong>{exportNotice.message}</strong>
                  </p>
                  <div className="admin-export-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="admin-btn" onClick={onCloseExportNotice}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {restoreDraft && (
            <>
              <div className="admin-restore-backdrop" onClick={onCancelRestore} aria-hidden="true">
                <div
                  className="admin-restore-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm restore backup"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3>Confirm restore</h3>
                  <p>
                    Replace current tiles with <strong>{restoreDraft.fileName}</strong>?
                  </p>
                  <p>
                    Subjects: {restoreDraft.config.subjects.length} | Verbs: {restoreDraft.config.verbs.length}
                  </p>
                  <div className="admin-restore-actions">
                    <button type="button" className="admin-btn" onClick={onConfirmRestore}>
                      Confirm restore
                    </button>
                    <button type="button" className="admin-btn ghost" onClick={onCancelRestore}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {deleteDraft && (
            <>
              <div className="admin-delete-backdrop" onClick={onCancelDeleteTile} aria-hidden="true" />
              <div className="admin-delete-modal" role="dialog" aria-modal="true" aria-label="Confirm delete tile">
                <h3>Delete tile?</h3>
                <p>
                  Delete &quot;{deleteDraft.tile.label}&quot; from {deleteDraft.scope} tiles?
                </p>
                <div className="admin-delete-actions">
                  <button type="button" className="admin-btn danger" onClick={onConfirmDeleteTile}>
                    Delete
                  </button>
                  <button type="button" className="admin-btn ghost" onClick={onCancelDeleteTile}>
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </main>
  )
}

export default App
