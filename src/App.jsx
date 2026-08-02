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
const DEV_ADMIN_PIN = '0405'
const TILE_BADGE_BACKGROUNDS = {
  subject: '#f1d5d5',
  verb: '#ebefbf',
  object: '#b1e3d5',
}
const TILE_BADGE_SELECTED_BACKGROUNDS = {
  subject: '#ebcbcb',
  verb: '#f1f6b9',
  object: '#a7d9cb',
}
const TILE_UPLOAD_MAX_SIZE = 512
const TILE_UPLOAD_QUALITY = 0.82
const QUICK_WORD_SLOT_COUNT = 5
const QUICK_WORD_GENERATED_BACKGROUND = 'transparent'

function formatDurationLabel(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function isLocalDevAdminMode() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true
  }

  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true
  }

  const private172Match = hostname.match(/^172\.(\d{1,3})\./)
  if (private172Match) {
    const secondOctet = Number(private172Match[1])
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true
    }
  }

  return false
}

const DEFAULT_SUBJECTS = []

const DEFAULT_VERBS = []

const DEFAULT_QUICK_WORDS = [
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

function isGeneratedBadgeImage(image) {
  if (typeof image !== 'string') {
    return false
  }

  return /^data:image\/svg\+xml(?:;charset=[^,]+)?,/i.test(image)
}

function getTileBadgeBackground(scope) {
  return TILE_BADGE_BACKGROUNDS[scope] || TILE_BADGE_BACKGROUNDS.verb
}

function getTileBadgeSelectedBackground(scope) {
  return TILE_BADGE_SELECTED_BACKGROUNDS[scope] || TILE_BADGE_SELECTED_BACKGROUNDS.verb
}

function getTileDisplayImage(tile, scope, isSelected) {
  if (!isSelected || !isGeneratedBadgeImage(tile?.image)) {
    return tile?.image
  }

  return makeBadgeImage(tile.label, getTileBadgeSelectedBackground(scope))
}

const DEFAULT_OBJECTS_BY_VERB = {}

function createQuickPlaceholder(slotIndex = 0) {
  return {
    id: `quick-slot-${Date.now()}-${slotIndex}`,
    label: '',
    image: makeBadgeImage('+', QUICK_WORD_GENERATED_BACKGROUND),
  }
}

function normalizeQuickWords(items) {
  if (!Array.isArray(items)) {
    return structuredClone(DEFAULT_QUICK_WORDS)
  }

  return items
    .filter((candidate) => candidate && typeof candidate === 'object')
    .slice(0, QUICK_WORD_SLOT_COUNT)
    .map((candidate, index) => {
      const fallback = createQuickPlaceholder(index)
      const label = typeof candidate.label === 'string' ? candidate.label : ''

      return {
        id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : fallback.id,
        label,
        image: typeof candidate.image === 'string'
          ? (isGeneratedBadgeImage(candidate.image)
            ? makeBadgeImage(label || '+', QUICK_WORD_GENERATED_BACKGROUND)
            : candidate.image)
          : makeBadgeImage(label || '+', QUICK_WORD_GENERATED_BACKGROUND),
      }
    })
}

function cloneDefaults() {
  return {
    subjects: structuredClone(DEFAULT_SUBJECTS),
    verbs: structuredClone(DEFAULT_VERBS),
    objectsByVerb: structuredClone(DEFAULT_OBJECTS_BY_VERB),
    quickWords: structuredClone(DEFAULT_QUICK_WORDS),
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

  if (config.quickWords !== undefined && !Array.isArray(config.quickWords)) {
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
      quickWords: normalizeQuickWords(parsed.quickWords),
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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = window.URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      window.URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = (error) => {
      window.URL.revokeObjectURL(objectUrl)
      reject(error)
    }

    image.src = objectUrl
  })
}

function exportCanvasDataUrl(canvas, type, quality) {
  try {
    const dataUrl = canvas.toDataURL(type, quality)
    if (dataUrl.startsWith(`data:${type}`)) {
      return dataUrl
    }
  } catch {
    // Ignore unsupported output formats and continue to fallbacks.
  }

  return ''
}

async function optimizeTileUpload(file) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return readFileAsDataUrl(file)
  }

  const image = await loadImageFromFile(file)
  const sourceWidth = image.naturalWidth || image.width || 1
  const sourceHeight = image.naturalHeight || image.height || 1
  const longestEdge = Math.max(sourceWidth, sourceHeight)
  const scale = Math.min(1, TILE_UPLOAD_MAX_SIZE / longestEdge)
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    return readFileAsDataUrl(file)
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  return (
    exportCanvasDataUrl(canvas, 'image/webp', TILE_UPLOAD_QUALITY)
    || exportCanvasDataUrl(canvas, 'image/jpeg', TILE_UPLOAD_QUALITY)
    || canvas.toDataURL('image/png')
  )
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
  const [quickWords, setQuickWords] = useState(initialConfig.quickWords)

  const [subject, setSubject] = useState(null)
  const [verb, setVerb] = useState(null)
  const [objectWord, setObjectWord] = useState(null)
  const [lastSpoken, setLastSpoken] = useState('')
  const [isThreeStepMode, setIsThreeStepMode] = useState(true)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia('(max-width: 980px)').matches
  })

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
  const [newTileNameError, setNewTileNameError] = useState('')
  const [newTileImage, setNewTileImage] = useState('')
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [syncState, setSyncState] = useState(
    isRemoteSyncEnabled() ? 'connecting' : 'local-only',
  )
  const [isSyncTipOpen, setIsSyncTipOpen] = useState(false)
  const syncTipRef = useRef(null)
  const topStripRef = useRef(null)
  const [mobileTopStripHeight, setMobileTopStripHeight] = useState(104)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [hasHydratedSync, setHasHydratedSync] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [exportNotice, setExportNotice] = useState(null)
  const [restoreDraft, setRestoreDraft] = useState(null)
  const [deleteDraft, setDeleteDraft] = useState(null)
  const [moveObjectDraft, setMoveObjectDraft] = useState(null)
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

    const payload = JSON.stringify({ subjects, verbs, objectsByVerb, quickWords })
    window.localStorage.setItem(STORAGE_KEY, payload)
  }, [subjects, verbs, objectsByVerb, quickWords])

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
          setQuickWords(normalizeQuickWords(remoteConfig.quickWords))
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

    const payload = { subjects, verbs, objectsByVerb, quickWords }
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
  }, [subjects, verbs, objectsByVerb, quickWords, hasHydratedSync, hasAdminAuth])

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const media = window.matchMedia('(max-width: 980px)')
    const onMediaChange = () => setIsMobileViewport(media.matches)
    onMediaChange()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onMediaChange)
      return () => media.removeEventListener('change', onMediaChange)
    }

    media.addListener(onMediaChange)
    return () => media.removeListener(onMediaChange)
  }, [])

  useEffect(() => {
    const element = topStripRef.current
    if (!element) {
      return undefined
    }

    const updateHeight = () => {
      setMobileTopStripHeight(Math.ceil(element.getBoundingClientRect().height))
    }

    updateHeight()

    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateHeight)
      observer.observe(element)
    }

    window.addEventListener('resize', updateHeight)

    return () => {
      window.removeEventListener('resize', updateHeight)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const className = 'free-mode-scroll'
    if (!isThreeStepMode) {
      document.body.classList.add(className)
    } else {
      document.body.classList.remove(className)
    }

    return () => {
      document.body.classList.remove(className)
    }
  }, [isThreeStepMode])

  const objectOptions = useMemo(() => {
    if (isThreeStepMode) {
      if (!verb) {
        return []
      }

      return objectsByVerb[verb.id] || []
    }

    return verbs.flatMap((verbItem) =>
      (objectsByVerb[verbItem.id] || []).map((item) => ({
        ...item,
        __sourceKey: `${verbItem.id}:${item.id}`,
      })),
    )
  }, [isThreeStepMode, objectsByVerb, verb, verbs])

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
    () => ({ subjects, verbs, objectsByVerb, quickWords }),
    [subjects, verbs, objectsByVerb, quickWords],
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

    if (isThreeStepMode) {
      setVerb(null)
      setObjectWord(null)
    }

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

    if (isLocalDevAdminMode() && pin === DEV_ADMIN_PIN) {
      setPinError('')
      setHasAdminAuth(true)
      setAdminSessionExpiresAt(null)
      setAdminUnlockLockedUntil(null)
      setAdminFailedAttempts(0)
      setIsPinOpen(false)
      setIsAdminOpen(true)
      setPinInput('')
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
    setNewTileName('')
    setNewTileImage('')
    setNewTileNameError('')
    setRestoreDraft(null)
    setExportNotice(null)
    setDeleteDraft(null)
    setMoveObjectDraft(null)
    setBackupStatus('')
    setNewTileNameError('')
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

  const addCreatedToast = (message, tone) => {
    const toastId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    setCreatedToasts((current) => [...current, { toastId, message, tone }])

    window.setTimeout(() => {
      setCreatedToasts((current) => current.filter((toast) => toast.toastId !== toastId))
    }, 3000)
  }

  const createNewTile = (label, image, scope) => {
    const fallbackBackground = scope === 'quick' ? QUICK_WORD_GENERATED_BACKGROUND : getTileBadgeBackground(scope)
    return {
      id: toTileId(label),
      label,
      image: image || makeBadgeImage(label, fallbackBackground),
    }
  }

  const onAddTile = () => {
    const label = newTileName.trim()
    if (!label) {
      setNewTileNameError('Tile name is required.')
      return
    }

    setNewTileNameError('')

    const tile = createNewTile(label, newTileImage.trim(), adminTab)

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
    } else if (adminTab === 'quick') {
      if (quickWords.length >= QUICK_WORD_SLOT_COUNT) {
        setNewTileNameError(`Quick tiles support up to ${QUICK_WORD_SLOT_COUNT} items. Update or delete a tile below to create a new quick tile.`)
        return
      }

      setQuickWords((current) => [...current, tile].slice(0, QUICK_WORD_SLOT_COUNT))
    }

    const createdTypeLabel = adminTab.charAt(0).toUpperCase() + adminTab.slice(1)
    addCreatedToast(`${createdTypeLabel} tile '${label}' created.`, adminTab)
    setNewTileName('')
    setNewTileImage('')
  }

  const onEditTile = (scope, id, field, value) => {
    const applyEdit = (item) => {
      if (item.id !== id) {
        return item
      }

      const nextItem = { ...item, [field]: value }

      if (field === 'label' && isGeneratedBadgeImage(item.image)) {
        const badgeBackground = scope === 'quick' ? QUICK_WORD_GENERATED_BACKGROUND : getTileBadgeBackground(scope)
        nextItem.image = makeBadgeImage(value || '+', badgeBackground)
      }

      return nextItem
    }

    if (scope === 'subject') {
      setSubjects((current) =>
        current.map((item) => applyEdit(item)),
      )
      return
    }

    if (scope === 'verb') {
      setVerbs((current) =>
        current.map((item) => applyEdit(item)),
      )
      return
    }

    if (scope === 'object' && objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: (current[objectVerbId] || []).map((item) => applyEdit(item)),
      }))
      return
    }

    if (scope === 'quick') {
      setQuickWords((current) =>
        current.map((item) => applyEdit(item)),
      )
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
      return
    }

    if (scope === 'quick') {
      setQuickWords((current) => moveItem(current, index, direction))
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
      return
    }

    if (scope === 'quick') {
      setQuickWords((current) => moveTo(current))
    }
  }

  const onStartDragTile = (scope, index, event) => {
    event.preventDefault()
    setDragState({ active: true, scope, fromIndex: index, overIndex: index })
  }

  const onRequestDeleteTile = (scope, tile, index) => {
    setExportNotice(null)
    setRestoreDraft(null)
    setMoveObjectDraft(null)
    setDeleteDraft({ scope, tile, index })
  }

  const onRequestMoveObjectTile = (tile, index) => {
    if (adminTab !== 'object' || !objectVerbId) {
      return
    }

    setExportNotice(null)
    setRestoreDraft(null)
    setDeleteDraft(null)
    setMoveObjectDraft({
      tile,
      index,
      fromVerbId: objectVerbId,
      toVerbId: objectVerbId,
    })
  }

  const onCancelMoveObjectTile = () => {
    setMoveObjectDraft(null)
  }

  const onConfirmMoveObjectTile = () => {
    if (!moveObjectDraft) {
      return
    }

    const { tile, index, fromVerbId, toVerbId } = moveObjectDraft
    setMoveObjectDraft(null)

    if (!fromVerbId || !toVerbId || fromVerbId === toVerbId) {
      return
    }

    setObjectsByVerb((current) => {
      const sourceTiles = [...(current[fromVerbId] || [])]
      const [movedTile] = sourceTiles.splice(index, 1)

      if (!movedTile) {
        return current
      }

      const targetTiles = [...(current[toVerbId] || []), movedTile]

      return {
        ...current,
        [fromVerbId]: sourceTiles,
        [toVerbId]: targetTiles,
      }
    })

    const destinationVerb = verbs.find((item) => item.id === toVerbId)
    addCreatedToast(
      `Object tile '${tile.label}' reassigned to '${destinationVerb?.label || 'selected verb'}'.`,
      'object',
    )
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
      return
    }

    if (scope === 'quick') {
      setDeletedToasts((current) => [...current, createDeletedToast({ scope, tile, index })])
      setQuickWords((current) => current.filter((item) => item.id !== tile.id))
      setNewTileNameError('')
    }
  }

  const onDuplicateTile = (scope, tile, index) => {
    const duplicateLabel = `${tile.label} copy`
    const duplicate = {
      ...structuredClone(tile),
      id: toTileId(tile.label),
      label: duplicateLabel,
    }

    if (isGeneratedBadgeImage(tile.image)) {
      const badgeBackground = scope === 'quick' ? QUICK_WORD_GENERATED_BACKGROUND : getTileBadgeBackground(scope)
      duplicate.image = makeBadgeImage(duplicateLabel, badgeBackground)
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
      return
    }

    if (scope === 'quick') {
      setQuickWords((current) => {
        const next = [...current]
        next.splice(index + 1, 0, duplicate)
        return next.slice(0, QUICK_WORD_SLOT_COUNT)
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
      return
    }

    if (deletedItem.scope === 'quick') {
      setQuickWords((current) => {
        const restored = insertAt(current, deletedItem.tile, deletedItem.index)
        return restored.slice(0, QUICK_WORD_SLOT_COUNT)
      })
      setDeletedToasts((current) => current.filter((toast) => toast.undoId !== undoId))
    }
  }

  const onDismissDeleteToast = (undoId) => {
    setDeletedToasts((current) => current.filter((toast) => toast.undoId !== undoId))
  }

  const onUploadTileImage = async (scope, id, file) => {
    if (!file) {
      return
    }

    try {
      const image = await optimizeTileUpload(file)
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
      const image = await optimizeTileUpload(file)
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
    setQuickWords(normalizeQuickWords(restoreDraft.config.quickWords))
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
    adminTab === 'subject'
      ? subjects
      : adminTab === 'verb'
        ? verbs
        : adminTab === 'object'
          ? adminObjectTiles
          : quickWords
  const adminTabLabel = adminTab === 'subject' ? 'subject' : adminTab === 'verb' ? 'verb' : adminTab === 'object' ? 'object' : 'quick'
  const createTileTitle = adminTabLabel === 'object' ? 'Create an object tile' : `Create a ${adminTabLabel} tile`
  const searchTileTitle = `Search ${adminTabLabel} tiles`
  const selectedObjectVerb = verbs.find((item) => item.id === objectVerbId)
  const subjectTileCount = subjects.length
  const verbTileCount = verbs.length
  const objectTileCount = Object.values(objectsByVerb).reduce(
    (total, list) => total + (Array.isArray(list) ? list.length : 0),
    0,
  )
  const quickTileCount = quickWords.length
  const activeQuickWords = useMemo(
    () => quickWords.filter((item) => typeof item?.label === 'string' && item.label.trim()),
    [quickWords],
  )
  const normalizedAdminSearch = adminSearchQuery.trim().toLowerCase()
  const visibleAdminTiles = normalizedAdminSearch
    ? adminTiles
        .map((item, sourceIndex) => ({ item, sourceIndex }))
        .filter(({ item }) => item.label.toLowerCase().includes(normalizedAdminSearch))
    : adminTiles.map((item, sourceIndex) => ({ item, sourceIndex }))

  const mobileStepClass = !subject ? 'step-subject' : !verb ? 'step-verb' : 'step-object'
  const boardModeClass = isThreeStepMode ? mobileStepClass : 'mode-free'
  const shellModeClass = isThreeStepMode ? 'mode-three-step' : 'mode-free'
  const isMobileFreeModeLayout = !isThreeStepMode && isMobileViewport
  const isVerbColumnActive = !isThreeStepMode || Boolean(subject)
  const isObjectColumnActive = !isThreeStepMode || Boolean(verb)

  const onSelectVerb = (item) => {
    setVerb(item)

    if (isThreeStepMode) {
      setObjectWord(null)
    }

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
    const spoken = phrase || item.label
    speakText(spoken)
    setLastSpoken(spoken)
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
    const replayText = sentence || lastSpoken || fallback

    speakText(replayText)
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

  const sideRail = (
    <aside className="side-rail" aria-label="quick words">
      {activeQuickWords.map((item) => (
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
          type="button"
          className={`mode-rail-btn ${isThreeStepMode ? 'three-step' : 'free'}`}
          onClick={() => setIsThreeStepMode((current) => !current)}
          aria-label={isThreeStepMode ? 'Disable 3-step mode' : 'Enable 3-step mode'}
        >
          {isThreeStepMode ? (
            <div className="step-badge" aria-hidden="true">
              <svg width="14" height="20.692" viewBox="0 0 14 20.692" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M0.588 5.866C0.728 4.89533 0.998667 4.046 1.4 3.318C1.80133 2.58067 2.30067 1.96933 2.898 1.484C3.50467 0.989333 4.19533 0.620666 4.97 0.377999C5.754 0.126 6.594 0 7.49 0C8.42333 0 9.26333 0.135333 10.01 0.405999C10.766 0.667332 11.41 1.036 11.942 1.512C12.474 1.97867 12.88 2.52933 13.16 3.164C13.4493 3.79867 13.594 4.48467 13.594 5.222C13.594 5.866 13.5193 6.43533 13.37 6.93C13.23 7.41533 13.0247 7.84 12.754 8.204C12.4833 8.568 12.1473 8.876 11.746 9.128C11.3447 9.38 10.892 9.59 10.388 9.758C11.6013 10.1407 12.5067 10.724 13.104 11.508C13.7013 12.292 14 13.2767 14 14.462C14 15.47 13.8133 16.3613 13.44 17.136C13.0667 17.9107 12.5627 18.564 11.928 19.096C11.2933 19.6187 10.556 20.0153 9.716 20.286C8.88533 20.5567 8.00333 20.692 7.07 20.692C6.05267 20.692 5.166 20.5753 4.41 20.342C3.654 20.1087 2.996 19.7633 2.436 19.306C1.876 18.8487 1.4 18.2887 1.008 17.626C0.616 16.9633 0.28 16.198 0 15.33L1.526 14.7C1.92733 14.532 2.30067 14.49 2.646 14.574C3.00067 14.6487 3.25733 14.8353 3.416 15.134C3.584 15.4607 3.766 15.7827 3.962 16.1C4.16733 16.4173 4.41 16.702 4.69 16.954C4.97 17.1967 5.29667 17.3973 5.67 17.556C6.05267 17.7053 6.50533 17.78 7.028 17.78C7.616 17.78 8.12933 17.6867 8.568 17.5C9.00667 17.304 9.37067 17.052 9.66 16.744C9.95867 16.436 10.178 16.0953 10.318 15.722C10.4673 15.3393 10.542 14.9567 10.542 14.574C10.542 14.0887 10.4907 13.65 10.388 13.258C10.2853 12.8567 10.0707 12.516 9.744 12.236C9.41733 11.956 8.946 11.7367 8.33 11.578C7.72333 11.4193 6.90667 11.34 5.88 11.34V8.876C6.72933 8.86667 7.434 8.78733 7.994 8.638C8.554 8.48867 8.99733 8.28333 9.324 8.022C9.66 7.75133 9.89333 7.42933 10.024 7.056C10.1547 6.68267 10.22 6.272 10.22 5.824C10.22 4.872 9.954 4.14867 9.422 3.654C8.89 3.15933 8.18067 2.912 7.294 2.912C6.88333 2.912 6.50533 2.97267 6.16 3.094C5.81467 3.206 5.502 3.36933 5.222 3.584C4.95133 3.78933 4.72267 4.032 4.536 4.312C4.34933 4.592 4.20933 4.9 4.116 5.236C3.95733 5.66533 3.74733 5.95 3.486 6.09C3.234 6.23 2.87467 6.26267 2.408 6.188L0.588 5.866Z"
                  fill="#E8E8E8"
                />
              </svg>
              <span className="label">step</span>
            </div>
          ) : (
            <span className="mode-rail-label">free mode</span>
          )}
        </button>
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
        </button>
      </div>
    </aside>
  )

  return (
    <main
      className={`figma-shell ${shellModeClass} ${isMobileFreeModeLayout ? 'mobile-free-mode-layout' : ''}`}
      data-node-id="1:59"
      style={{ '--mobile-top-strip-height': `${mobileTopStripHeight}px` }}
    >
      <header ref={topStripRef} className="top-strip">
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
            <div className="back-btn-inner" aria-hidden="true">
              <svg width="39.4574" height="40" viewBox="0 0 39.4574 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M29.593 25H19.7287V31.6667L8.22029 20L19.7287 8.33333V15H29.593V25Z"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </button>
        </div>
        <div className="top-controls">
          <button type="button" className="control-btn play-btn" onClick={onRepeat}>
            <div className="icon-card-bg" aria-hidden="true" />
            <svg className="icon-card-svg play-svg" width="34.9411" height="34.9411" viewBox="0 0 34.9411 34.9411" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path
                d="M16.0147 6.84554C16.0144 6.64275 15.954 6.4446 15.8412 6.27608C15.7284 6.10757 15.5682 5.97624 15.3809 5.89868C15.1935 5.82111 14.9873 5.80079 14.7884 5.84027C14.5895 5.87975 14.4068 5.97727 14.2632 6.12051L9.33655 11.0457C9.14642 11.237 8.92022 11.3887 8.67105 11.4919C8.42189 11.5951 8.15473 11.6478 7.88504 11.647H4.36763C3.98151 11.647 3.6112 11.8004 3.33817 12.0734C3.06514 12.3465 2.91176 12.7168 2.91176 13.1029V21.8382C2.91176 22.2243 3.06514 22.5946 3.33817 22.8676C3.6112 23.1407 3.98151 23.2941 4.36763 23.2941H7.88504C8.15473 23.2933 8.42189 23.346 8.67105 23.4492C8.92022 23.5524 9.14642 23.7041 9.33655 23.8953L14.2618 28.822C14.4053 28.9659 14.5883 29.0638 14.7876 29.1036C14.9869 29.1433 15.1935 29.123 15.3812 29.0451C15.569 28.9673 15.7294 28.8356 15.8421 28.6665C15.9549 28.4975 16.0149 28.2987 16.0147 28.0955V6.84554Z"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M23.2941 13.1029C24.2391 14.3629 24.7499 15.8955 24.7499 17.4705C24.7499 19.0456 24.2391 20.5781 23.2941 21.8382"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M28.1916 26.7357C29.4084 25.519 30.3735 24.0746 31.032 22.4848C31.6905 20.8951 32.0294 19.1912 32.0294 17.4705C32.0294 15.7498 31.6905 14.046 31.032 12.4562C30.3735 10.8665 29.4084 9.42205 28.1916 8.20533"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="icon-card-label play-label">Play</div>
          </button>
          <button type="button" className="control-btn refresh-btn" onClick={onRestart}>
            <div className="icon-card-bg" aria-hidden="true" />
            <svg className="icon-card-svg refresh-svg" width="34.9411" height="34.9411" viewBox="0 0 34.9411 34.9411" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path
                d="M4.36763 17.4705C4.36763 20.062 5.13611 22.5954 6.57587 24.7501C8.01564 26.9049 10.062 28.5843 12.4563 29.576C14.8505 30.5678 17.4851 30.8273 20.0268 30.3217C22.5685 29.8161 24.9032 28.5682 26.7357 26.7357C28.5682 24.9032 29.8161 22.5685 30.3217 20.0268C30.8273 17.4851 30.5678 14.8505 29.576 12.4563C28.5843 10.062 26.9049 8.01564 24.7501 6.57587C22.5954 5.13611 20.062 4.36763 17.4705 4.36763C13.8075 4.38141 10.2916 5.81074 7.65792 8.35674L4.36763 11.647"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4.36763 4.36763V11.647H11.647"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="icon-card-label refresh-label">Refresh</div>
          </button>
        </div>
      </header>

      {isMobileFreeModeLayout ? (
        <>
          <div className="mobile-free-fixed-rail">
            {sideRail}
          </div>
          <section className="mobile-free-content" aria-label="AAC communication grid">
            <article className="subject-panel mobile-free-panel">
              <div className="subject-grid">
                {subjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`subject-tile ${subject?.id === item.id ? 'selected' : ''}`}
                    onClick={() => onSelectSubject(item)}
                  >
                    <img
                      src={getTileDisplayImage(item, 'subject', subject?.id === item.id)}
                      alt=""
                      aria-hidden="true"
                      className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="verb-column active mobile-free-panel" aria-label="Verb column">
              <div className="verb-grid">
                {verbs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`verb-tile ${verb?.id === item.id ? 'selected' : ''}`}
                    onClick={() => onSelectVerb(item)}
                  >
                    <img
                      src={getTileDisplayImage(item, 'verb', verb?.id === item.id)}
                      alt=""
                      aria-hidden="true"
                      className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="object-column active mobile-free-panel" aria-label="Object column">
              <div className="object-grid">
                {objectOptions.map((item) => (
                  <button
                    key={item.__sourceKey || item.id}
                    type="button"
                    className={`ghost-tile ${
                      objectWord && (objectWord.__sourceKey || objectWord.id) === (item.__sourceKey || item.id)
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => onSelectObject(item)}
                  >
                    <img
                      src={getTileDisplayImage(
                        item,
                        'object',
                        objectWord && (objectWord.__sourceKey || objectWord.id) === (item.__sourceKey || item.id),
                      )}
                      alt=""
                      aria-hidden="true"
                      className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className={`board-layout ${boardModeClass}`} aria-label="AAC communication grid">
          {sideRail}

          <article className="subject-panel">
            <div className="subject-grid">
              {subjects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`subject-tile ${subject?.id === item.id ? 'selected' : ''}`}
                  onClick={() => onSelectSubject(item)}
                >
                  <img
                    src={getTileDisplayImage(item, 'subject', subject?.id === item.id)}
                    alt=""
                    aria-hidden="true"
                    className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </article>

          <article className={`verb-column ${isVerbColumnActive ? 'active' : 'empty'}`} aria-label="Verb column">
            {isVerbColumnActive && (
              <div className="verb-grid">
                {verbs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`verb-tile ${verb?.id === item.id ? 'selected' : ''}`}
                    onClick={() => onSelectVerb(item)}
                  >
                    <img
                      src={getTileDisplayImage(item, 'verb', verb?.id === item.id)}
                      alt=""
                      aria-hidden="true"
                      className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className={`object-column ${isObjectColumnActive ? 'active' : 'empty'}`} aria-label="Object column">
            {isObjectColumnActive && (
              <div className="object-grid">
                {objectOptions.map((item) => (
                  <button
                    key={item.__sourceKey || item.id}
                    type="button"
                    className={`ghost-tile ${
                      objectWord && (objectWord.__sourceKey || objectWord.id) === (item.__sourceKey || item.id)
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => onSelectObject(item)}
                  >
                    <img
                      src={getTileDisplayImage(
                        item,
                        'object',
                        objectWord && (objectWord.__sourceKey || objectWord.id) === (item.__sourceKey || item.id),
                      )}
                      alt=""
                      aria-hidden="true"
                      className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

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
              <div className="admin-title-row">
                <h2>Tile Admin</h2>
                <span
                  className={`admin-session-icon ${hasAdminAuth ? 'unlocked' : 'locked'}`}
                  role="img"
                  aria-label={adminStatusMessage}
                  title={adminStatusMessage}
                >
                  {hasAdminAuth ? '🔓' : '🔒'}
                </span>
              </div>
              <div className="admin-header-actions">
                <button type="button" className="admin-btn ghost" onClick={onExportBackup}>
                  <span className="admin-action-icon" aria-hidden="true">⤓</span>
                  Export backup
                </button>
                <label className="admin-btn ghost admin-file-btn">
                  <span className="admin-action-icon" aria-hidden="true">⤒</span>
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
                  <span className="admin-action-icon" aria-hidden="true">🔒</span>
                  Lock admin
                </button>
                <button type="button" className="admin-close-icon" onClick={onCloseAdmin} aria-label="Close Tile Admin">
                  ✕
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
                <span>Subject</span>
                <span className="admin-tab-badge subject" aria-label={`${subjectTileCount} subject tiles`}>
                  {subjectTileCount}
                </span>
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'verb' ? 'active' : ''}`}
                onClick={() => setAdminTab('verb')}
              >
                <span>Verb</span>
                <span className="admin-tab-badge verb" aria-label={`${verbTileCount} verb tiles`}>
                  {verbTileCount}
                </span>
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'object' ? 'active' : ''}`}
                onClick={() => setAdminTab('object')}
              >
                <span>Object</span>
                <span className="admin-tab-badge object" aria-label={`${objectTileCount} object tiles`}>
                  {objectTileCount}
                </span>
              </button>
              <button
                type="button"
                className={`admin-tab ${adminTab === 'quick' ? 'active' : ''}`}
                onClick={() => setAdminTab('quick')}
              >
                <span>Quick tiles</span>
                <span className="admin-tab-badge quick" aria-label={`${quickTileCount} quick tiles`}>
                  {quickTileCount}
                </span>
              </button>
            </div>

            {adminTab === 'object' && (
              <>
                <div className="admin-object-help" role="note" aria-live="polite">
                  <p>
                    Choose a verb first. New object tiles will be added to that verb.
                  </p>
                </div>
                <label className="admin-row">
                  <span>Select verb category</span>
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
              </>
            )}

            {adminTab === 'quick' && (
              <div className="admin-object-help" role="note" aria-live="polite">
                <p>Quick tiles are your fast-access words or phrases shown in the side rail for one-tap speaking. There are 5 slots available.</p>
              </div>
            )}

            <>
              <section className={`admin-create-card ${adminTabLabel}`} aria-label={createTileTitle}>
                <h3>{createTileTitle}</h3>
                <p>Give the tile a name, then add an image.</p>
                <div className="admin-create">
                  <div className="admin-create-name-field">
                    <input
                      type="text"
                      value={newTileName}
                      onChange={(event) => {
                        setNewTileName(event.target.value)
                        if (newTileNameError) {
                          setNewTileNameError('')
                        }
                      }}
                      placeholder="Tile name"
                      aria-invalid={Boolean(newTileNameError)}
                    />
                    {newTileNameError && <p className="admin-inline-error" role="alert">{newTileNameError}</p>}
                    {newTileImage && (
                      <img className="admin-upload-preview" src={newTileImage} alt="Selected tile image preview" />
                    )}
                  </div>
                  <label className="admin-btn admin-file-btn admin-upload-btn">
                    {newTileImage ? 'Upload a new image' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => onUploadNewTileImage(event.target.files?.[0])}
                    />
                  </label>
                  <button type="button" className="admin-btn admin-create-submit" onClick={onAddTile}>
                    {`Create ${adminTabLabel} tile`}
                  </button>
                </div>
              </section>

              <div className="admin-section-divider" aria-hidden="true" />
            </>

            <label className="admin-search-row">
              <span>{searchTileTitle}</span>
              <input
                type="search"
                value={adminSearchQuery}
                onChange={(event) => setAdminSearchQuery(event.target.value)}
                placeholder="Search by tile name"
              />
            </label>

            {adminTab === 'object' && (
              <h3 className="admin-list-title">
                {selectedObjectVerb
                  ? `Object tiles for "${selectedObjectVerb.label}"`
                  : 'Object tiles'}
              </h3>
            )}

            <div className="admin-list">
              {visibleAdminTiles.map(({ item, sourceIndex }) => (
                <article
                  key={`${item.id}-${sourceIndex}`}
                  className={`admin-item ${
                    dragState.active && dragState.fromIndex === sourceIndex && dragState.scope === adminTab
                      ? 'dragging'
                      : ''
                  } ${
                    dragState.active && dragState.overIndex === sourceIndex && dragState.scope === adminTab
                      ? 'drop-target'
                      : ''
                  }`}
                  data-admin-item-index={sourceIndex}
                >
                  <div className={`admin-item-media ${adminTab === 'quick' ? 'quick-item-media' : ''}`}>
                    <div
                      className={`admin-item-preview ${
                        adminTab === 'subject'
                          ? 'subject-tile'
                          : adminTab === 'verb'
                            ? 'verb-tile'
                            : 'ghost-tile'
                      }`}
                      aria-hidden="true"
                    >
                      <img
                        src={item.image}
                        alt=""
                        className={isGeneratedBadgeImage(item.image) ? 'generated-badge' : ''}
                      />
                      <span>{item.label}</span>
                    </div>
                    <button
                      type="button"
                      className="admin-media-btn admin-media-drag admin-drag-handle"
                      onPointerDown={(event) => onStartDragTile(adminTab, sourceIndex, event)}
                      aria-label={`Drag to reorder ${item.label}`}
                    >
                      ↕
                    </button>
                    <button
                      type="button"
                      className="admin-media-btn admin-media-delete"
                      onClick={() => onRequestDeleteTile(adminTab, item, sourceIndex)}
                      aria-label={`Delete ${item.label || 'quick slot'}`}
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
                    <label className="admin-btn admin-file-btn admin-upload-btn">
                      {item.image && !isGeneratedBadgeImage(item.image) ? 'Upload a new image' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          onUploadTileImage(adminTab, item.id, event.target.files?.[0])
                        }
                      />
                    </label>
                  </div>
                  <div className={`admin-item-actions ${adminTab === 'object' ? 'object-actions' : ''} ${adminTab === 'quick' ? 'quick-actions' : ''}`}>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onReorderTile(adminTab, sourceIndex, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onReorderTile(adminTab, sourceIndex, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onDuplicateTile(adminTab, item, sourceIndex)}
                    >
                      Duplicate
                    </button>
                    {adminTab === 'object' && (
                      <button
                        type="button"
                        className="admin-btn ghost"
                        onClick={() => onRequestMoveObjectTile(item, sourceIndex)}
                      >
                        Change verb
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {visibleAdminTiles.length === 0 && (
              <p className="admin-empty-state" role="status" aria-live="polite">
                {normalizedAdminSearch
                  ? `No ${adminTabLabel} tiles found for "${adminSearchQuery.trim()}". Create a new ${adminTabLabel} tile above.`
                  : `No ${adminTabLabel} tiles found.`}
              </p>
            )}
          </section>

          {(deletedToasts.length > 0 || createdToasts.length > 0) && (
            <div className="admin-undo-toast-stack" aria-live="polite">
              {createdToasts.map((toast) => (
                <div key={toast.toastId} className={`admin-undo-toast admin-toast-success admin-toast-${toast.tone || 'subject'}`} role="status">
                  <span>{toast.message}</span>
                </div>
              ))}

              {deletedToasts.map((toast) => (
                <div key={toast.undoId} className="admin-undo-toast" role="status">
                  <span>
                    Tile &quot;{toast.tile.label}&quot; deleted.
                  </span>
                  <div className="admin-undo-toast-actions">
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => onUndoDelete(toast.undoId)}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className="admin-toast-close"
                      aria-label="Dismiss notification"
                      onClick={() => onDismissDeleteToast(toast.undoId)}
                    >
                      ×
                    </button>
                  </div>
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
                    Subjects: {restoreDraft.config.subjects.length} | Verbs: {restoreDraft.config.verbs.length} | Quick: {normalizeQuickWords(restoreDraft.config.quickWords).length}
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

          {moveObjectDraft && (
            <>
              <div className="admin-move-backdrop" onClick={onCancelMoveObjectTile} aria-hidden="true" />
              <div className="admin-move-modal" role="dialog" aria-modal="true" aria-label="Change object tile verb">
                <h3>Change verb category</h3>
                <p>
                  Move &quot;{moveObjectDraft.tile.label}&quot; to:
                </p>
                <select
                  value={moveObjectDraft.toVerbId}
                  onChange={(event) =>
                    setMoveObjectDraft((current) =>
                      current
                        ? {
                            ...current,
                            toVerbId: event.target.value,
                          }
                        : current,
                    )
                  }
                >
                  {verbs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <div className="admin-move-actions">
                  <button type="button" className="admin-btn" onClick={onConfirmMoveObjectTile}>
                    Move tile
                  </button>
                  <button type="button" className="admin-btn ghost" onClick={onCancelMoveObjectTile}>
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
