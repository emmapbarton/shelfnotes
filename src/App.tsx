import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Library,
  LogIn,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  deleteCloudNote,
  loadCloudLibrary,
  loadLocalLibrary,
  migrateLegacy,
  migrateLocalToCloud,
  saveBook as saveCloudBook,
  saveLocalLibrary,
  saveNote as saveCloudNote,
  uid,
} from './lib/data'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Book, BookStatus, LegacyLibrary, LibraryData, Note } from './types'
import {
  RichContent,
  RichTextEditor,
} from './components/RichTextEditor'
import { richTextPreview } from './lib/richText'

const ConnectionsHome = lazy(() =>
  import('./components/Connections').then((module) => ({
    default: module.ConnectionsHome,
  })),
)
const CanvasWorkspace = lazy(() =>
  import('./components/Connections').then((module) => ({
    default: module.CanvasWorkspace,
  })),
)

const emptyLibrary: LibraryData = {
  books: [],
  notes: [],
  canvases: [],
  canvasItems: [],
  canvasLinks: [],
}
const labels: Record<BookStatus, string> = {
  not_started: 'Not started',
  reading: 'Reading',
  paused: 'Paused',
  finished: 'Finished',
}

function App() {
  const [library, setLibrary] = useState<LibraryData>(emptyLibrary)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [showBookForm, setShowBookForm] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const user = session?.user ?? null

  useEffect(() => {
    let active = true
    async function initialise() {
      const local = loadLocalLibrary()
      setLibrary(local)
      if (!supabase) {
        setLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (data.session?.user) {
        try {
          const cloud = await loadCloudLibrary()
          setLibrary(cloud.books.length ? cloud : local)
        } catch {
          setMessage('Cloud tables are not ready yet. Your local library is still safe.')
        }
      }
      setLoading(false)
    }
    initialise()

    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => {
      active = false
      subscription?.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!loading) saveLocalLibrary(library)
  }, [library, loading])

  const upsertBook = async (book: Book) => {
    setLibrary((current) => ({
      ...current,
      books: current.books.some((item) => item.id === book.id)
        ? current.books.map((item) => (item.id === book.id ? book : item))
        : [book, ...current.books],
    }))
    try {
      await saveCloudBook(user, book)
    } catch {
      setMessage('Saved locally. Cloud sync needs the Supabase schema.')
    }
  }

  const upsertNote = async (note: Note) => {
    setLibrary((current) => ({
      ...current,
      notes: current.notes.some((item) => item.id === note.id)
        ? current.notes.map((item) => (item.id === note.id ? note : item))
        : [note, ...current.notes],
    }))
    try {
      await saveCloudNote(user, note)
    } catch {
      setMessage('Note saved locally. Cloud sync needs the Supabase schema.')
    }
  }

  const removeNote = async (noteId: string) => {
    setLibrary((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== noteId),
    }))
    try {
      await deleteCloudNote(user, noteId)
    } catch {
      setMessage('Deleted locally. Cloud sync needs the Supabase schema.')
    }
  }

  const syncLibrary = async () => {
    if (!user) {
      setShowAuth(true)
      return
    }
    setSyncing(true)
    try {
      await migrateLocalToCloud(user, library)
      const cloud = await loadCloudLibrary()
      setLibrary(cloud)
      setMessage('Library synced to your account.')
    } catch {
      setMessage('Could not sync yet. Apply the Supabase schema first.')
    } finally {
      setSyncing(false)
    }
  }

  const exportLibrary = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `shelf-notes-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  const importLibrary = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as LibraryData | LegacyLibrary
      const imported =
        'notes' in parsed && Array.isArray(parsed.notes)
          ? {
              ...(parsed as LibraryData),
              canvases: (parsed as LibraryData).canvases ?? [],
              canvasItems: (parsed as LibraryData).canvasItems ?? [],
              canvasLinks: (parsed as LibraryData).canvasLinks ?? [],
            }
          : migrateLegacy(parsed as LegacyLibrary)
      setLibrary(imported)
      setMessage(`Imported ${imported.books.length} books.`)
    } catch {
      setMessage('That file is not a valid Shelf Notes export.')
    }
  }

  if (loading) {
    return <div className="loading-screen">Opening your shelf…</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark"><BookOpen size={21} /></span>
          <span>Shelf Notes</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end>Today</NavLink>
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/connections">
            Connections
          </NavLink>
        </nav>
        <div className="top-actions">
          <button className="icon-button desktop-only" onClick={exportLibrary} title="Export JSON">
            <Download size={17} />
          </button>
          <button className="icon-button desktop-only" onClick={() => importRef.current?.click()} title="Import JSON">
            <Upload size={17} />
          </button>
          <input
            ref={importRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => importLibrary(event.target.files?.[0])}
          />
          {user ? (
            <button className="account-button" onClick={() => supabase?.auth.signOut()}>
              <span className="account-dot" />
              <span className="desktop-only">{user.email}</span>
              <LogOut size={16} />
            </button>
          ) : (
            <button className="account-button" onClick={() => setShowAuth(true)}>
              <LogIn size={16} /> Sign in
            </button>
          )}
          <button className="button primary compact" onClick={() => setShowBookForm(true)}>
            <Plus size={17} /> <span className="desktop-only">Add book</span>
          </button>
        </div>
      </header>

      {message && (
        <div className="notice">
          <span>{message}</span>
          <button onClick={() => setMessage('')} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                library={library}
                user={user}
                syncing={syncing}
                onSync={syncLibrary}
                onAddBook={() => setShowBookForm(true)}
                onUpdateBook={upsertBook}
              />
            }
          />
          <Route
            path="/library"
            element={
              <LibraryPage
                library={library}
                onAddBook={() => setShowBookForm(true)}
              />
            }
          />
          <Route
            path="/books/:bookId"
            element={
              <BookPage
                library={library}
                onUpdateBook={upsertBook}
                onSaveNote={upsertNote}
                onDeleteNote={removeNote}
                user={user}
              />
            }
          />
          <Route
            path="/connections"
            element={<Suspense fallback={<div className="loading-screen">Opening your canvases…</div>}><ConnectionsHome library={library} user={user} onChange={setLibrary} onMessage={setMessage} /></Suspense>}
          />
          <Route
            path="/connections/:canvasId"
            element={<Suspense fallback={<div className="loading-screen">Opening your canvas…</div>}><CanvasWorkspace library={library} user={user} onChange={setLibrary} onMessage={setMessage} /></Suspense>}
          />
        </Routes>
      </main>

      {showBookForm && (
        <BookForm onClose={() => setShowBookForm(false)} onSave={upsertBook} />
      )}
      {showAuth && (
        <AuthDialog onClose={() => setShowAuth(false)} onMessage={setMessage} />
      )}
    </div>
  )
}

function Dashboard({
  library,
  user,
  syncing,
  onSync,
  onAddBook,
  onUpdateBook,
}: {
  library: LibraryData
  user: User | null
  syncing: boolean
  onSync: () => void
  onAddBook: () => void
  onUpdateBook: (book: Book) => void
}) {
  const reading = library.books.filter((book) => book.status === 'reading')
  const recentNotes = [...library.notes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Your reading desk</p>
          <h1>What are you reading into?</h1>
          <p className="hero-copy">
            Capture the thought while it is alive. The connections can come later.
          </p>
        </div>
        <button className="button primary" onClick={onAddBook}><Plus size={18} /> Add a book</button>
      </section>

      {!user && (
        <section className="sync-card">
          <div className="sync-icon"><Cloud size={22} /></div>
          <div>
            <strong>Your library is saved on this device</strong>
            <p>Sign in when you are ready to keep it in sync everywhere.</p>
          </div>
          <button className="button subtle" onClick={onSync}>Set up sync</button>
        </section>
      )}

      {user && (
        <section className="sync-line">
          <span><Check size={15} /> Signed in as {user.email}</span>
          <button className="text-button" onClick={onSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync local notes'}
          </button>
        </section>
      )}

      <section className="section">
        <div className="section-heading">
          <div><p className="eyebrow">Continue</p><h2>Currently reading</h2></div>
          <Link to="/library">See your library <ChevronRight size={16} /></Link>
        </div>
        {reading.length ? (
          <div className="reading-grid">
            {reading.map((book) => (
              <ReadingCard key={book.id} book={book} onUpdateBook={onUpdateBook} />
            ))}
          </div>
        ) : (
          <EmptyState title="Your reading desk is clear" copy="Choose a book and mark it as reading." action={onAddBook} />
        )}
      </section>

      <section className="split-section">
        <div className="section">
          <div className="section-heading"><div><p className="eyebrow">Recently captured</p><h2>Latest notes</h2></div></div>
          <div className="note-list">
            {recentNotes.map((note) => {
              const book = library.books.find((item) => item.id === note.bookId)
              return <NoteRow key={note.id} note={note} book={book} />
            })}
            {!recentNotes.length && <p className="muted">Your latest thoughts will appear here.</p>}
          </div>
        </div>
        <aside className="idea-card">
          <Sparkles size={20} />
          <p className="eyebrow">Coming next</p>
          <h2>Ideas become more useful when they can touch.</h2>
          <p>Soon, you will be able to arrange notes on a canvas and draw meaningful connections between them.</p>
          <Link to="/connections">Preview connections <ChevronRight size={16} /></Link>
        </aside>
      </section>
    </div>
  )
}

function ReadingCard({ book, onUpdateBook }: { book: Book; onUpdateBook: (book: Book) => void }) {
  const [page, setPage] = useState(book.currentPage)
  const progress = book.totalPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0
  return (
    <article className="reading-card">
      <BookCover book={book} />
      <div className="reading-card-body">
        <Link to={`/books/${book.id}`}><h3>{book.title}</h3></Link>
        <p>{book.author || 'Unknown author'}</p>
        <div className="progress-meta"><span>Page {book.currentPage} of {book.totalPages || '—'}</span><span>{progress}%</span></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <form
          className="page-update"
          onSubmit={(event) => {
            event.preventDefault()
            onUpdateBook({ ...book, currentPage: page, updatedAt: new Date().toISOString() })
          }}
        >
          <input aria-label={`Current page for ${book.title}`} type="number" min="0" max={book.totalPages || undefined} value={page} onChange={(event) => setPage(Number(event.target.value))} />
          <button className="button subtle compact">Update page</button>
          <Link className="button primary compact" to={`/books/${book.id}`}>Add note</Link>
        </form>
      </div>
    </article>
  )
}

function LibraryPage({ library, onAddBook }: { library: LibraryData; onAddBook: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<BookStatus | 'all'>('all')
  const books = library.books.filter((book) => {
    const matchesQuery = `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (status === 'all' || book.status === status)
  })
  return (
    <div className="page">
      <section className="page-title">
        <div><p className="eyebrow">Your shelves</p><h1>Library</h1><p>{library.books.length} books, {library.notes.length} notes</p></div>
        <button className="button primary" onClick={onAddBook}><Plus size={18} /> Add book</button>
      </section>
      <div className="library-tools">
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books, authors, categories…" /></label>
        <div className="filters">
          {(['all', 'reading', 'not_started', 'paused', 'finished'] as const).map((item) => (
            <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>
              {item === 'all' ? 'All' : labels[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="book-grid">
        {books.map((book) => (
          <Link className="book-card" to={`/books/${book.id}`} key={book.id}>
            <BookCover book={book} />
            <div className="book-card-body">
              <span className={`status ${book.status}`}>{labels[book.status]}</span>
              <p className="category">{book.category}</p>
              <h2>{book.title}</h2>
              <p>{book.author || 'Unknown author'}</p>
              <span className="book-notes">{library.notes.filter((note) => note.bookId === book.id).length} notes</span>
            </div>
          </Link>
        ))}
      </div>
      {!books.length && <EmptyState title="No books found" copy="Try another search or add a new book." action={onAddBook} />}
    </div>
  )
}

function BookPage({
  library,
  onUpdateBook,
  onSaveNote,
  onDeleteNote,
  user,
}: {
  library: LibraryData
  onUpdateBook: (book: Book) => void
  onSaveNote: (note: Note) => void
  onDeleteNote: (noteId: string) => void
  user: User | null
}) {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const book = library.books.find((item) => item.id === bookId)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  if (!book) return <div className="page"><EmptyState title="Book not found" copy="It may have been removed." action={() => navigate('/library')} /></div>
  const notes = library.notes
    .filter((note) => note.bookId === book.id)
    .sort((a, b) => (b.pageStart ?? 0) - (a.pageStart ?? 0))
  const progress = book.totalPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0

  return (
    <div className="page book-page">
      <Link className="back-link" to="/library"><ArrowLeft size={17} /> Back to library</Link>
      <section className="book-hero">
        <BookCover book={book} />
        <div className="book-hero-main">
          <p className="category">{book.category}</p>
          <h1>{book.title}</h1>
          <p className="book-author">{book.author || 'Unknown author'}</p>
          <div className="book-stats">
            <span><strong>{book.currentPage}</strong> current page</span>
            <span><strong>{progress}%</strong> complete</span>
            <span><strong>{notes.length}</strong> notes</span>
          </div>
          <div className="progress-track large"><span style={{ width: `${progress}%` }} /></div>
          <div className="book-actions">
            <button className="button primary" onClick={() => setShowNoteForm(true)}><Plus size={18} /> Capture a note</button>
            <select
              value={book.status}
              onChange={(event) => onUpdateBook({ ...book, status: event.target.value as BookStatus, updatedAt: new Date().toISOString() })}
              aria-label="Reading status"
            >
              {Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="section notes-section">
        <div className="section-heading">
          <div><p className="eyebrow">Page by page</p><h2>Reading notes</h2></div>
          <button className="button subtle" onClick={() => setShowNoteForm(true)}><Plus size={17} /> Add note</button>
        </div>
        <div className="book-notes-list">
          {notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-page-marker">
                <span>PAGE</span>
                <strong>{pageLabel(note)}</strong>
              </div>
              <div className="note-content">
                <div className="note-type">{note.kind}</div>
                <RichContent content={note.content} />
                <div className="tag-row">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              </div>
              <div className="note-card-actions">
                <button className="text-button" onClick={() => { setEditingNote(note); setShowNoteForm(true) }}>Edit</button>
                <button className="icon-button delete" onClick={() => onDeleteNote(note.id)} aria-label="Delete note"><X size={16} /></button>
              </div>
            </article>
          ))}
        </div>
        {!notes.length && <EmptyState title="No notes yet" copy="Capture the first thought that makes you pause." action={() => setShowNoteForm(true)} />}
      </section>
      {showNoteForm && <NoteForm book={book} note={editingNote} user={user} onClose={() => { setShowNoteForm(false); setEditingNote(null) }} onSave={onSaveNote} />}
    </div>
  )
}

function NoteForm({ book, note, user, onClose, onSave }: { book: Book; note: Note | null; user: User | null; onClose: () => void; onSave: (note: Note) => void }) {
  const [pageStart, setPageStart] = useState(note?.pageStart ?? (book.currentPage || 1))
  const [pageEnd, setPageEnd] = useState(note?.pageEnd ?? (book.currentPage || 1))
  const [kind, setKind] = useState<Note['kind']>(note?.kind ?? 'note')
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '')
  const [validationError, setValidationError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const hasImage = /<img[\s>]/i.test(content)
    if (!richTextPreview(content) && !hasImage) {
      setValidationError('Add some text or an image before saving.')
      return
    }
    const timestamp = new Date().toISOString()
    onSave({
      id: note?.id ?? uid(),
      bookId: book.id,
      pageStart,
      pageEnd,
      content: content.trim(),
      kind,
      tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
      createdAt: note?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })
    onClose()
  }
  return (
    <Modal title={note ? 'Edit note' : 'Capture a note'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label>From page<input type="number" min="0" value={pageStart} onChange={(event) => setPageStart(Number(event.target.value))} /></label>
          <label>To page<input type="number" min="0" value={pageEnd} onChange={(event) => setPageEnd(Number(event.target.value))} /></label>
          <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as Note['kind'])}><option value="note">Note</option><option value="quote">Quote</option><option value="question">Question</option></select></label>
        </div>
        <label>Your thought<RichTextEditor value={content} onChange={setContent} user={user} bookId={book.id} /></label>
        {validationError && <p className="error">{validationError}</p>}
        <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="freedom, memory, language" /></label>
        <div className="form-actions"><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary">{note ? 'Save changes' : 'Save note'}</button></div>
      </form>
    </Modal>
  )
}

function BookForm({ onClose, onSave }: { onClose: () => void; onSave: (book: Book) => void }) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [category, setCategory] = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const timestamp = new Date().toISOString()
    onSave({
      id: uid(), title: title.trim(), author: author.trim(), category: category.trim() || 'Uncategorised',
      coverUrl: '', totalPages, currentPage: 0, status: 'not_started', createdAt: timestamp, updatedAt: timestamp,
    })
    onClose()
  }
  return (
    <Modal title="Add to your shelf" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Author<input value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
        <div className="form-row">
          <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Essays" /></label>
          <label>Total pages<input type="number" min="0" value={totalPages || ''} onChange={(event) => setTotalPages(Number(event.target.value))} /></label>
        </div>
        <div className="form-actions"><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary">Add book</button></div>
      </form>
    </Modal>
  )
}

function AuthDialog({ onClose, onMessage }: { onClose: () => void; onMessage: (message: string) => void }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/shelfnotes/' },
    })
    setSending(false)
    if (error) onMessage(error.message)
    else {
      onMessage(`Check ${email} for your sign-in link.`)
      onClose()
    }
  }
  return (
    <Modal title="Keep your shelf in sync" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="auth-intro"><Cloud size={24} /><p>We will email you a secure sign-in link. No password to remember.</p></div>
        <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        {!isSupabaseConfigured && <p className="error">Supabase has not been configured.</p>}
        <div className="form-actions"><button type="button" className="button subtle" onClick={onClose}>Not now</button><button disabled={sending || !isSupabaseConfigured} className="button primary">{sending ? 'Sending…' : 'Email me a sign-in link'}</button></div>
      </form>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </section>
    </div>
  )
}

function BookCover({ book }: { book: Book }) {
  const initials = book.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('')
  return (
    <div className="book-cover">
      {book.coverUrl ? <img src={book.coverUrl} alt="" /> : <><span>{initials}</span><small>{book.title}</small></>}
    </div>
  )
}

function NoteRow({ note, book }: { note: Note; book?: Book }) {
  return (
    <Link className="note-row" to={`/books/${note.bookId}`}>
      <span className="note-page">p. {pageLabel(note)}</span>
      <span><strong>{richTextPreview(note.content)}</strong><small>{book?.title ?? 'Unknown book'}</small></span>
      <ChevronRight size={17} />
    </Link>
  )
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action: () => void }) {
  return <div className="empty-state"><Library size={26} /><h3>{title}</h3><p>{copy}</p><button className="button subtle" onClick={action}>Get started</button></div>
}

function pageLabel(note: Note) {
  if (note.pageStart == null) return '—'
  return note.pageEnd && note.pageEnd !== note.pageStart ? `${note.pageStart}–${note.pageEnd}` : `${note.pageStart}`
}

export default App
