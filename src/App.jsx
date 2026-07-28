import { useMemo, useState } from 'react'
import './App.css'

const subjectImages = {
  terry: 'http://localhost:3845/assets/49d2eadad2c25d8d24f94e7429f7ff1c59b9882d.png',
  dan: 'http://localhost:3845/assets/655304d7787fbadd4ca128b069a29246c77441f8.png',
  tom: 'http://localhost:3845/assets/82a24cfc45ba1ccc39c5ad3cab857bd79fc5a71d.png',
  vipul: 'http://localhost:3845/assets/12b1cb06e175a15156790eda2fa75ed7588ec014.png',
  lera: 'http://localhost:3845/assets/67b0c357003bec41e87d9619dcd534cf574abd4a.png',
  sara: 'http://localhost:3845/assets/f19b1f0483f8b048db90d6418c7e8d1f00615e72.png',
  chloe: 'http://localhost:3845/assets/7f790e13defac74f4be97c832809854575a22886.png',
  becky: 'http://localhost:3845/assets/75d9f31eba6372f71c72ca7b413a34b424cf16c2.png',
  joanna: 'http://localhost:3845/assets/a74ac2fd0391adeb5fffb18d96ed168478f23306.png',
  anisa: 'http://localhost:3845/assets/7406f35621c6a3d6381286f097f9e9686ad3fb09.png',
}

const SUBJECTS = [
  { id: 'terry', label: 'Terry', image: subjectImages.terry },
  { id: 'dan-1', label: 'Dan', image: subjectImages.dan },
  { id: 'tom', label: 'Tom', image: subjectImages.tom },
  { id: 'vipul-1', label: 'Vipul', image: subjectImages.vipul },
  { id: 'lera', label: 'Lera', image: subjectImages.lera },
  { id: 'sara', label: 'Sara', image: subjectImages.sara },
  { id: 'chloe', label: 'Chloe', image: subjectImages.chloe },
  { id: 'becky', label: 'Becky', image: subjectImages.becky },
  { id: 'joanna', label: 'Joanna', image: subjectImages.joanna },
  { id: 'anisa', label: 'Anisa', image: subjectImages.anisa },
  { id: 'dan-2', label: 'Dan', image: subjectImages.dan },
  { id: 'vipul-2', label: 'Vipul', image: subjectImages.vipul },
]

const VERBS = [
  {
    id: 'food',
    label: 'food',
    image: 'http://localhost:3845/assets/67f3ea0e3c6b7446377587c41dba8c3781b10328.png',
  },
  {
    id: 'break',
    label: 'break',
    image: 'http://localhost:3845/assets/b427820f461789dc19851940034e8a43156dd406.png',
  },
  {
    id: 'more',
    label: 'more',
    image: 'http://localhost:3845/assets/7cb807301bbcf1ee205987d55497cf26b3e7d313.png',
  },
  {
    id: 'no',
    label: 'no',
    image: 'http://localhost:3845/assets/58abecbf86bdd7f7c7344e85760440fba3108fe1.png',
  },
  {
    id: 'thank-you',
    label: 'thank you',
    image: 'http://localhost:3845/assets/adf8decbdf4728357326f117915c83d4f76d94f1.png',
  },
  {
    id: 'i-want',
    label: 'I want',
    image: 'http://localhost:3845/assets/0cb99214ba346a6607b83a2b31545380cbcb42f1.png',
  },
]

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

const OBJECTS_BY_VERB = {
  'i-want': [
    { id: 'toilet', label: 'Toilet', spoken: 'to go to the toilet', image: makeBadgeImage('Toilet', '#d9f2ff') },
    { id: 'drink', label: 'Drink', spoken: 'a drink', image: makeBadgeImage('Drink', '#dff3d2') },
    { id: 'food', label: 'Food', spoken: 'some food', image: makeBadgeImage('Food', '#fafdd9') },
    { id: 'music', label: 'Music', spoken: 'music', image: makeBadgeImage('Music', '#fdeaec') },
    { id: 'ipad', label: 'iPad', spoken: 'the iPad', image: makeBadgeImage('iPad', '#ececff') },
  ],
  food: [
    { id: 'sandwich', label: 'Sandwich', spoken: 'a sandwich', image: makeBadgeImage('Sandwich', '#fafdd9') },
    { id: 'fruit', label: 'Fruit', spoken: 'fruit', image: makeBadgeImage('Fruit', '#dff3d2') },
    { id: 'water', label: 'Water', spoken: 'water', image: makeBadgeImage('Water', '#d9f2ff') },
    { id: 'snack', label: 'Snack', spoken: 'a snack', image: makeBadgeImage('Snack', '#fdeaec') },
  ],
  break: [
    { id: 'toilet-break', label: 'Toilet', spoken: 'to go to the toilet', image: makeBadgeImage('Toilet', '#d9f2ff') },
    { id: 'quiet', label: 'Quiet', spoken: 'quiet time', image: makeBadgeImage('Quiet', '#ececff') },
    { id: 'outside', label: 'Outside', spoken: 'to go outside', image: makeBadgeImage('Outside', '#dff3d2') },
  ],
  'thank-you': [
    { id: 'teacher', label: 'Teacher', spoken: 'teacher', image: makeBadgeImage('Teacher', '#fdeaec') },
    { id: 'mum', label: 'Mum', spoken: 'mum', image: makeBadgeImage('Mum', '#d9f2ff') },
    { id: 'friend', label: 'Friend', spoken: 'my friend', image: makeBadgeImage('Friend', '#fafdd9') },
  ],
  more: [
    { id: 'more-food', label: 'Food', spoken: 'more food', image: makeBadgeImage('Food', '#fafdd9') },
    { id: 'more-time', label: 'Time', spoken: 'more time', image: makeBadgeImage('Time', '#ececff') },
    { id: 'more-play', label: 'Play', spoken: 'more play', image: makeBadgeImage('Play', '#dff3d2') },
  ],
  no: [
    { id: 'stop', label: 'Stop', spoken: 'stop', image: makeBadgeImage('Stop', '#fdeaec') },
    { id: 'dont-want', label: "Don't want", spoken: "don't want this", image: makeBadgeImage("Don't want", '#d9f2ff') },
    { id: 'finished', label: 'Finished', spoken: 'I am finished', image: makeBadgeImage('Finished', '#fafdd9') },
  ],
  feel: [
    { id: 'happy', label: 'Happy', image: makeBadgeImage('Happy', '#fdeaec') },
    { id: 'sad', label: 'Sad', image: makeBadgeImage('Sad', '#d9f2ff') },
    { id: 'angry', label: 'Angry', image: makeBadgeImage('Angry', '#fafdd9') },
    { id: 'tired', label: 'Tired', image: makeBadgeImage('Tired', '#ececff') },
    { id: 'worried', label: 'Worried', image: makeBadgeImage('Worried', '#dff3d2') },
  ],
  need: [
    { id: 'help', label: 'Help', image: makeBadgeImage('Help', '#d9f2ff') },
    { id: 'break', label: 'Break', image: makeBadgeImage('Break', '#fafdd9') },
    { id: 'quiet', label: 'Quiet', image: makeBadgeImage('Quiet', '#ececff') },
    { id: 'hug', label: 'Hug', image: makeBadgeImage('Hug', '#fdeaec') },
  ],
  like: [
    { id: 'book', label: 'Book', image: makeBadgeImage('Book', '#fafdd9') },
    { id: 'song', label: 'Song', image: makeBadgeImage('Song', '#d9f2ff') },
    { id: 'game', label: 'Game', image: makeBadgeImage('Game', '#dff3d2') },
    { id: 'outside', label: 'Outside', image: makeBadgeImage('Outside', '#ececff') },
  ],
}

function speakText(text) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
    return
  }

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
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

function App() {
  const [subject, setSubject] = useState(null)
  const [verb, setVerb] = useState(null)
  const [objectWord, setObjectWord] = useState(null)
  const [lastSpoken, setLastSpoken] = useState('')

  const objectOptions = useMemo(() => {
    if (!verb) {
      return []
    }

    return OBJECTS_BY_VERB[verb.id] || []
  }, [verb])

  const sentencePreview = useMemo(() => {
    return [subject?.label, verb?.label, objectWord?.label]
      .filter(Boolean)
      .join('  •  ')
  }, [subject, verb, objectWord])

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

  return (
    <main className="figma-shell" data-node-id="1:59">
      <header className="top-strip">
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

      <section className="board-layout" aria-label="AAC communication grid">
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
          <button type="button" className="lock-tile" aria-label="Locked area">
            🔒
          </button>
        </aside>

        <article className="subject-panel">
          <div className="subject-grid">
            {SUBJECTS.map((item) => (
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
              {VERBS.map((item) => (
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

    </main>
  )
}

export default App
