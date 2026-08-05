import { useEffect, useMemo, useState } from 'react'
import {
  archiveEnterpriseClass,
  archiveEnterprisePupil,
  createEnterpriseClass,
  createEnterprisePupil,
  linkParentEmailToPupil,
  lookupEnterpriseProfile,
  unlinkParentEmailFromPupil,
  updateEnterpriseClass,
  updateEnterprisePupil,
} from '../lib/enterpriseDirectorySync'
import './EnterpriseApp.css'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function TeacherPortal({ teacher, onSignOut, onTeacherProfileUpdate }) {
  const [activeClassId, setActiveClassId] = useState(teacher.classes[0]?.id || '')
  const [selectedPupilId, setSelectedPupilId] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [newClassGrade, setNewClassGrade] = useState('')
  const [newPupilName, setNewPupilName] = useState('')
  const [newPupilGoal, setNewPupilGoal] = useState('')
  const [parentEmailDraftByPupilId, setParentEmailDraftByPupilId] = useState({})
  const [errorMessage, setErrorMessage] = useState('')
  const [busyAction, setBusyAction] = useState('')

  const activeClass = useMemo(
    () => teacher.classes.find((room) => room.id === activeClassId) || null,
    [activeClassId, teacher.classes],
  )

  useEffect(() => {
    if (!teacher.classes.length) {
      setActiveClassId('')
      setSelectedPupilId('')
      return
    }

    const stillExists = teacher.classes.some((room) => room.id === activeClassId)
    if (!stillExists) {
      setActiveClassId(teacher.classes[0].id)
      setSelectedPupilId('')
    }
  }, [activeClassId, teacher.classes])

  useEffect(() => {
    if (!selectedPupilId || !activeClass) {
      return
    }

    const stillExists = activeClass.pupils.some((item) => item.id === selectedPupilId)
    if (!stillExists) {
      setSelectedPupilId('')
    }
  }, [activeClass, selectedPupilId])

  const selectedPupil = useMemo(() => {
    if (!activeClass) {
      return null
    }

    return activeClass.pupils.find((pupil) => pupil.id === selectedPupilId) || null
  }, [activeClass, selectedPupilId])

  const runTeacherUpdate = async (actionLabel, operation) => {
    setErrorMessage('')
    setBusyAction(actionLabel)

    try {
      const payload = await operation()
      if (payload?.profile) {
        onTeacherProfileUpdate(payload.profile)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Action failed. Try again.')
    } finally {
      setBusyAction('')
    }
  }

  const onCreateClass = async (event) => {
    event.preventDefault()

    const name = newClassName.trim()
    const grade = newClassGrade.trim()

    if (!name || !grade) {
      setErrorMessage('Class name and grade are required.')
      return
    }

    await runTeacherUpdate('create-class', () => createEnterpriseClass({
      teacherId: teacher.id,
      name,
      grade,
    }))

    setNewClassName('')
    setNewClassGrade('')
  }

  const onRenameClass = async (classRoom) => {
    const nextName = window.prompt('Class name', classRoom.name)
    if (nextName === null) {
      return
    }

    const nextGrade = window.prompt('Grade', classRoom.grade)
    if (nextGrade === null) {
      return
    }

    const name = nextName.trim()
    const grade = nextGrade.trim()

    if (!name || !grade) {
      setErrorMessage('Class name and grade are required.')
      return
    }

    await runTeacherUpdate('rename-class', () => updateEnterpriseClass(classRoom.id, {
      name,
      grade,
    }))
  }

  const onArchiveClass = async (classRoom) => {
    const confirmed = window.confirm(`Archive class ${classRoom.name}? Pupils in this class will also be archived.`)
    if (!confirmed) {
      return
    }

    await runTeacherUpdate('archive-class', () => archiveEnterpriseClass(classRoom.id))
  }

  const onCreatePupil = async (event) => {
    event.preventDefault()

    if (!activeClass) {
      setErrorMessage('Select a class before adding a pupil.')
      return
    }

    const name = newPupilName.trim()
    const communicationGoal = newPupilGoal.trim()

    if (!name || !communicationGoal) {
      setErrorMessage('Pupil name and communication goal are required.')
      return
    }

    await runTeacherUpdate('create-pupil', () => createEnterprisePupil({
      classId: activeClass.id,
      name,
      communicationGoal,
    }))

    setNewPupilName('')
    setNewPupilGoal('')
  }

  const onRenamePupil = async (pupil) => {
    const nextName = window.prompt('Pupil name', pupil.name)
    if (nextName === null) {
      return
    }

    const nextGoal = window.prompt('Communication goal', pupil.communicationGoal)
    if (nextGoal === null) {
      return
    }

    const name = nextName.trim()
    const communicationGoal = nextGoal.trim()

    if (!name || !communicationGoal) {
      setErrorMessage('Pupil name and communication goal are required.')
      return
    }

    await runTeacherUpdate('rename-pupil', () => updateEnterprisePupil(pupil.id, {
      name,
      communicationGoal,
    }))
  }

  const onArchivePupil = async (pupil) => {
    const confirmed = window.confirm(`Archive pupil ${pupil.name}?`)
    if (!confirmed) {
      return
    }

    await runTeacherUpdate('archive-pupil', () => archiveEnterprisePupil(pupil.id))
  }

  const onChangeParentDraft = (pupilId, value) => {
    setParentEmailDraftByPupilId((current) => ({
      ...current,
      [pupilId]: value,
    }))
  }

  const onAddParentEmail = async (event, pupil) => {
    event.preventDefault()
    const rawEmail = parentEmailDraftByPupilId[pupil.id] || ''
    const email = rawEmail.trim().toLowerCase()

    if (!email) {
      setErrorMessage('Enter a parent email before adding.')
      return
    }

    await runTeacherUpdate('add-parent-link', () => linkParentEmailToPupil(pupil.id, email))

    setParentEmailDraftByPupilId((current) => ({
      ...current,
      [pupil.id]: '',
    }))
  }

  const onRemoveParentEmail = async (pupil, email) => {
    await runTeacherUpdate('remove-parent-link', () => unlinkParentEmailFromPupil(pupil.id, email))
  }

  const isBusy = Boolean(busyAction)

  return (
    <>
      <section className="enterprise-card">
        <div className="enterprise-toolbar">
          <div>
            <p className="enterprise-eyebrow">Teacher Workspace</p>
            <h2>{teacher.name}</h2>
            <p className="enterprise-note">Select a class, then a pupil profile to open communication support.</p>
          </div>
          <button type="button" className="enterprise-back-link" onClick={onSignOut}>Sign out</button>
        </div>
      </section>

      <section className="enterprise-card">
        <h2>Classes</h2>
        <form className="enterprise-inline-form" onSubmit={onCreateClass}>
          <input
            type="text"
            placeholder="New class name"
            value={newClassName}
            onChange={(event) => setNewClassName(event.target.value)}
            disabled={isBusy}
          />
          <input
            type="text"
            placeholder="Grade"
            value={newClassGrade}
            onChange={(event) => setNewClassGrade(event.target.value)}
            disabled={isBusy}
          />
          <button type="submit" className="enterprise-primary" disabled={isBusy}>Add class</button>
        </form>
        <div className="enterprise-grid">
          {teacher.classes.map((room) => (
            <article key={room.id} className="enterprise-item">
              <h3>{room.name}</h3>
              <p>{room.grade} • {room.pupils.length} pupils</p>
              <div className="enterprise-actions-row">
                <button
                  type="button"
                  className="enterprise-ghost"
                  disabled={isBusy}
                  onClick={() => {
                    setActiveClassId(room.id)
                    setSelectedPupilId('')
                  }}
                >
                  {activeClassId === room.id ? 'Viewing class' : 'View pupils'}
                </button>
                <button type="button" className="enterprise-ghost" disabled={isBusy} onClick={() => onRenameClass(room)}>Rename</button>
                <button type="button" className="enterprise-ghost danger" disabled={isBusy} onClick={() => onArchiveClass(room)}>Archive</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="enterprise-card">
        <h2>Pupils {activeClass ? `• ${activeClass.name}` : ''}</h2>
        {!activeClass && <p className="enterprise-note">Choose a class above to continue.</p>}
        {activeClass && (
          <form className="enterprise-inline-form" onSubmit={onCreatePupil}>
            <input
              type="text"
              placeholder="New pupil name"
              value={newPupilName}
              onChange={(event) => setNewPupilName(event.target.value)}
              disabled={isBusy}
            />
            <input
              type="text"
              placeholder="Communication goal"
              value={newPupilGoal}
              onChange={(event) => setNewPupilGoal(event.target.value)}
              disabled={isBusy}
            />
            <button type="submit" className="enterprise-primary" disabled={isBusy}>Add pupil</button>
          </form>
        )}
        {activeClass && (
          <div className="enterprise-grid">
            {activeClass.pupils.map((pupil) => (
              <article key={pupil.id} className="enterprise-item">
                <h3>{pupil.name}</h3>
                <span className="enterprise-badge">Goal: {pupil.communicationGoal}</span>
                <p>Parent contacts: {pupil.parentEmails.join(', ')}</p>
                <div className="enterprise-parent-email-list">
                  {pupil.parentEmails.map((email) => (
                    <button
                      key={`${pupil.id}-${email}`}
                      type="button"
                      className="enterprise-parent-chip"
                      disabled={isBusy}
                      onClick={() => onRemoveParentEmail(pupil, email)}
                      title="Remove parent link"
                    >
                      {email} ×
                    </button>
                  ))}
                </div>
                <form className="enterprise-parent-link-form" onSubmit={(event) => onAddParentEmail(event, pupil)}>
                  <input
                    type="email"
                    placeholder="Add parent email"
                    value={parentEmailDraftByPupilId[pupil.id] || ''}
                    onChange={(event) => onChangeParentDraft(pupil.id, event.target.value)}
                    disabled={isBusy}
                  />
                  <button type="submit" className="enterprise-ghost" disabled={isBusy}>Add parent</button>
                </form>
                <div className="enterprise-actions-row">
                  <button
                    type="button"
                    className="enterprise-ghost"
                    disabled={isBusy}
                    onClick={() => setSelectedPupilId(pupil.id)}
                  >
                    {selectedPupilId === pupil.id ? 'Profile selected' : 'Open profile'}
                  </button>
                  <button type="button" className="enterprise-ghost" disabled={isBusy} onClick={() => onRenamePupil(pupil)}>Rename</button>
                  <button type="button" className="enterprise-ghost danger" disabled={isBusy} onClick={() => onArchivePupil(pupil)}>Archive</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {errorMessage && <p className="enterprise-error" role="alert">{errorMessage}</p>}
      </section>

      {selectedPupil && (
        <section className="enterprise-card">
          <h2>{selectedPupil.name} Dashboard</h2>
          <p className="enterprise-note">{selectedPupil.communicationGoal}</p>
          <a className="enterprise-link" href="/" target="_blank" rel="noreferrer">Open communication board in new tab</a>
        </section>
      )}
    </>
  )
}

function ParentPortal({ parent, onSignOut }) {
  const hasSingleChild = parent.children.length === 1
  const [selectedChildId, setSelectedChildId] = useState(hasSingleChild ? parent.children[0].id : '')

  const selectedChild = parent.children.find((child) => child.id === selectedChildId) || null

  return (
    <>
      <section className="enterprise-card">
        <div className="enterprise-toolbar">
          <div>
            <p className="enterprise-eyebrow">Parent Workspace</p>
            <h2>{parent.name}</h2>
            <p className="enterprise-note">
              {hasSingleChild
                ? 'Direct dashboard access is enabled for your child.'
                : 'Choose a child to open their communication dashboard.'}
            </p>
          </div>
          <button type="button" className="enterprise-back-link" onClick={onSignOut}>Sign out</button>
        </div>
      </section>

      {!hasSingleChild && (
        <section className="enterprise-card">
          <h2>Select Child</h2>
          <div className="enterprise-grid">
            {parent.children.map((child) => (
              <article key={child.id} className="enterprise-item">
                <h3>{child.name}</h3>
                <p>Class: {child.className}</p>
                <p>Teacher: {child.teacherName}</p>
                <button type="button" className="enterprise-ghost" onClick={() => setSelectedChildId(child.id)}>
                  {selectedChildId === child.id ? 'Selected' : 'Open dashboard'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedChild && (
        <section className="enterprise-card">
          <h2>{selectedChild.name} Communication Dashboard</h2>
          <span className="enterprise-badge">Goal: {selectedChild.communicationGoal}</span>
          <p className="enterprise-note">Class: {selectedChild.className}</p>
          <p className="enterprise-note">Teacher: {selectedChild.teacherName}</p>
          <a className="enterprise-link" href="/" target="_blank" rel="noreferrer">Open communication board in new tab</a>
        </section>
      )}
    </>
  )
}

export default function EnterpriseApp() {
  const [role, setRole] = useState('teacher')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [session, setSession] = useState(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [directorySource, setDirectorySource] = useState('')

  useEffect(() => {
    document.body.classList.add('enterprise-mode')
    return () => {
      document.body.classList.remove('enterprise-mode')
    }
  }, [])

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setDirectorySource('')

    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      setError('Enter an email address to continue.')
      return
    }

    setIsSigningIn(true)

    try {
      const result = await lookupEnterpriseProfile(role, normalizedEmail)

      if (!result.profile) {
        setError(`${role === 'teacher' ? 'Teacher' : 'Parent'} account not found in this pilot workspace.`)
        return
      }

      setDirectorySource(result.source)
      setSession({ type: role, profile: result.profile })
    } finally {
      setIsSigningIn(false)
    }
  }

  const onTeacherProfileUpdate = (profile) => {
    setSession((current) => {
      if (!current || current.type !== 'teacher') {
        return current
      }

      return {
        ...current,
        profile,
      }
    })
  }

  return (
    <main className="enterprise-shell">
      <header className="enterprise-header">
        <div>
          <p className="enterprise-eyebrow">Arti Enterprise Pilot</p>
          <h1>Role-based School And Family Portal</h1>
          <p className="enterprise-subline">Teacher: classes and pupils. Parent: direct child communication dashboard.</p>
        </div>
        <a href="/" className="enterprise-back-link">Open original dashboard</a>
      </header>

      <div className="enterprise-container">
        {!session && (
          <section className="enterprise-card">
            <h2>Sign in</h2>
            <div className="enterprise-login-toggle" role="tablist" aria-label="Choose portal role">
              <button
                type="button"
                className={`enterprise-pill ${role === 'teacher' ? 'active' : ''}`}
                onClick={() => setRole('teacher')}
              >
                Teacher
              </button>
              <button
                type="button"
                className={`enterprise-pill ${role === 'parent' ? 'active' : ''}`}
                onClick={() => setRole('parent')}
              >
                Parent
              </button>
            </div>

            <form onSubmit={onSubmit}>
              <div className="enterprise-field">
                <label htmlFor="enterprise-email">Email</label>
                <input
                  id="enterprise-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  disabled={isSigningIn}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={role === 'teacher' ? 'ava@springfield.edu' : 'mia.harris@example.com'}
                />
              </div>
              <button type="submit" className="enterprise-primary" disabled={isSigningIn}>
                {isSigningIn ? 'Checking...' : 'Continue'}
              </button>
            </form>

            {error && <p className="enterprise-error" role="alert">{error}</p>}
          </section>
        )}

        {session && directorySource === 'fallback' && (
          <section className="enterprise-card">
            <span className="enterprise-badge">Using pilot fallback directory</span>
            <p className="enterprise-note">Run the latest server/supabase.sql in your enterprise Supabase project to switch this portal to API-backed roster data.</p>
          </section>
        )}

        {session?.type === 'teacher' && (
          <TeacherPortal
            teacher={session.profile}
            onSignOut={() => setSession(null)}
            onTeacherProfileUpdate={onTeacherProfileUpdate}
          />
        )}

        {session?.type === 'parent' && (
          <ParentPortal parent={session.profile} onSignOut={() => setSession(null)} />
        )}
      </div>
    </main>
  )
}
