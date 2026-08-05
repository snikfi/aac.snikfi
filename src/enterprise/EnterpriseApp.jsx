import { useEffect, useMemo, useState } from 'react'
import { enterpriseDirectory } from './mockDirectory'
import './EnterpriseApp.css'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function TeacherPortal({ teacher, onSignOut }) {
  const [activeClassId, setActiveClassId] = useState(teacher.classes[0]?.id || '')
  const [selectedPupilId, setSelectedPupilId] = useState('')

  const activeClass = useMemo(
    () => teacher.classes.find((room) => room.id === activeClassId) || null,
    [activeClassId, teacher.classes],
  )

  const selectedPupil = useMemo(() => {
    if (!activeClass) {
      return null
    }

    return activeClass.pupils.find((pupil) => pupil.id === selectedPupilId) || null
  }, [activeClass, selectedPupilId])

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
        <div className="enterprise-grid">
          {teacher.classes.map((room) => (
            <article key={room.id} className="enterprise-item">
              <h3>{room.name}</h3>
              <p>{room.grade} • {room.pupils.length} pupils</p>
              <button
                type="button"
                className="enterprise-ghost"
                onClick={() => {
                  setActiveClassId(room.id)
                  setSelectedPupilId('')
                }}
              >
                {activeClassId === room.id ? 'Viewing class' : 'View pupils'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="enterprise-card">
        <h2>Pupils {activeClass ? `• ${activeClass.name}` : ''}</h2>
        {!activeClass && <p className="enterprise-note">Choose a class above to continue.</p>}
        {activeClass && (
          <div className="enterprise-grid">
            {activeClass.pupils.map((pupil) => (
              <article key={pupil.id} className="enterprise-item">
                <h3>{pupil.name}</h3>
                <span className="enterprise-badge">Goal: {pupil.communicationGoal}</span>
                <p>Parent contacts: {pupil.parentEmails.join(', ')}</p>
                <button
                  type="button"
                  className="enterprise-ghost"
                  onClick={() => setSelectedPupilId(pupil.id)}
                >
                  {selectedPupilId === pupil.id ? 'Profile selected' : 'Open profile'}
                </button>
              </article>
            ))}
          </div>
        )}
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

  useEffect(() => {
    document.body.classList.add('enterprise-mode')
    return () => {
      document.body.classList.remove('enterprise-mode')
    }
  }, [])

  const onSubmit = (event) => {
    event.preventDefault()
    setError('')

    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      setError('Enter an email address to continue.')
      return
    }

    if (role === 'teacher') {
      const teacher = enterpriseDirectory.teachers.find((item) => normalizeEmail(item.email) === normalizedEmail)
      if (!teacher) {
        setError('Teacher account not found in this pilot workspace.')
        return
      }

      setSession({ type: 'teacher', profile: teacher })
      return
    }

    const parent = enterpriseDirectory.parents.find((item) => normalizeEmail(item.email) === normalizedEmail)
    if (!parent) {
      setError('Parent account not found in this pilot workspace.')
      return
    }

    setSession({ type: 'parent', profile: parent })
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
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={role === 'teacher' ? 'ava@springfield.edu' : 'mia.harris@example.com'}
                />
              </div>
              <button type="submit" className="enterprise-primary">Continue</button>
            </form>

            {error && <p className="enterprise-error" role="alert">{error}</p>}
          </section>
        )}

        {session?.type === 'teacher' && (
          <TeacherPortal teacher={session.profile} onSignOut={() => setSession(null)} />
        )}

        {session?.type === 'parent' && (
          <ParentPortal parent={session.profile} onSignOut={() => setSession(null)} />
        )}
      </div>
    </main>
  )
}
