import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRemoteTileConfig,
  isRemoteSyncEnabled,
  saveRemoteTileConfig,
} from './lib/tileConfigSync'
import './App.css'

const STORAGE_KEY = 'arti-aac-tiles-v1'
const ADMIN_PIN = '0405'

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
  const [restoreDraft, setRestoreDraft] = useState(null)
  const [lastDeleted, setLastDeleted] = useState(null)
  const [dragState, setDragState] = useState({
    active: false,
    scope: '',
    fromIndex: -1,
    overIndex: -1,
  })

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
    if (!hasHydratedSync || !isRemoteSyncEnabled()) {
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
        .catch(() => {
          setSyncState('error')
        })
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [subjects, verbs, objectsByVerb, hasHydratedSync])

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
    setPinInput('')
    setPinError('')
    setIsPinOpen(true)
  }

  const onSubmitPin = () => {
    if (pinInput === ADMIN_PIN) {
      setIsPinOpen(false)
      setIsAdminOpen(true)
      setPinError('')
      return
    }

    setPinError('Incorrect code')
  }

  const onCloseAdmin = () => {
    setIsAdminOpen(false)
    setAdminTab('subject')
    setLastDeleted(null)
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

  const onDeleteTile = (scope, tile, index) => {
    const confirmed = window.confirm(`Delete \"${tile.label}\" from ${scope} tiles?`)
    if (!confirmed) {
      return
    }

    if (scope === 'subject') {
      setLastDeleted({ scope, tile, index })
      setSubjects((current) => current.filter((item) => item.id !== tile.id))
      return
    }

    if (scope === 'verb') {
      setLastDeleted({
        scope,
        tile,
        index,
        objectsForVerb: structuredClone(objectsByVerb[tile.id] || []),
      })
      setVerbs((current) => current.filter((item) => item.id !== tile.id))
      setObjectsByVerb((current) => {
        const next = { ...current }
        delete next[tile.id]
        return next
      })
      return
    }

    if (scope === 'object' && objectVerbId) {
      setLastDeleted({ scope, tile, index, objectVerbId })
      setObjectsByVerb((current) => ({
        ...current,
        [objectVerbId]: (current[objectVerbId] || []).filter((item) => item.id !== tile.id),
      }))
    }
  }

  const onUndoDelete = () => {
    if (!lastDeleted) {
      return
    }

    const insertAt = (list, restoredTile, restoredIndex) => {
      const next = [...list]
      const safeIndex = Math.max(0, Math.min(restoredIndex, next.length))
      next.splice(safeIndex, 0, restoredTile)
      return next
    }

    if (lastDeleted.scope === 'subject') {
      setSubjects((current) => insertAt(current, lastDeleted.tile, lastDeleted.index))
      setLastDeleted(null)
      return
    }

    if (lastDeleted.scope === 'verb') {
      setVerbs((current) => insertAt(current, lastDeleted.tile, lastDeleted.index))
      setObjectsByVerb((current) => ({
        ...current,
        [lastDeleted.tile.id]: structuredClone(lastDeleted.objectsForVerb || []),
      }))
      setLastDeleted(null)
      return
    }

    if (lastDeleted.scope === 'object' && lastDeleted.objectVerbId) {
      setObjectsByVerb((current) => ({
        ...current,
        [lastDeleted.objectVerbId]: insertAt(
          current[lastDeleted.objectVerbId] || [],
          lastDeleted.tile,
          lastDeleted.index,
        ),
      }))
      setLastDeleted(null)
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

  const onExportBackup = () => {
    if (typeof window === 'undefined') {
      return
    }

    const timestamp = formatBackupTimestamp()
    const content = JSON.stringify(tileConfig, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const objectUrl = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = objectUrl
    anchor.download = `arti-tiles-backup-${timestamp}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(objectUrl)
    setBackupStatus('Backup exported.')
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
              className="lock-tile"
              aria-label="Admin panel"
              onClick={onOpenPin}
            >
              🔒
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
            <input
              type="password"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              placeholder="Code"
              maxLength={8}
            />
            {pinError && <p className="admin-error">{pinError}</p>}
            <div className="admin-pin-actions">
              <button type="button" className="admin-btn" onClick={onSubmitPin}>
                Unlock
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
              <h2>Tile Admin</h2>
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

            {restoreDraft && (
              <div className="admin-restore-modal" role="dialog" aria-modal="true" aria-label="Confirm restore backup">
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

            {lastDeleted && (
              <div className="admin-undo-row" role="status" aria-live="polite">
                <span>
                  Deleted &quot;{lastDeleted.tile.label}&quot;.
                </span>
                <button type="button" className="admin-btn ghost" onClick={onUndoDelete}>
                  Undo
                </button>
              </div>
            )}

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
                  <img src={item.image} alt="" aria-hidden="true" />
                  <div className="admin-item-fields">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(event) =>
                        onEditTile(adminTab, item.id, 'label', event.target.value)
                      }
                    />
                    <input
                      type="text"
                      value={item.image}
                      onChange={(event) =>
                        onEditTile(adminTab, item.id, 'image', event.target.value)
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
                      className="admin-btn ghost admin-drag-handle"
                      onPointerDown={(event) => onStartDragTile(adminTab, index, event)}
                      aria-label={`Drag to reorder ${item.label}`}
                    >
                      Drag
                    </button>
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
                      className="admin-btn danger"
                      onClick={() => onDeleteTile(adminTab, item, index)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

    </main>
  )
}

export default App
