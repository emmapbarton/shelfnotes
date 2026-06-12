import { FormEvent, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft,
  BookMarked,
  ChevronRight,
  FolderPlus,
  FolderX,
  Group,
  Layers3,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteCanvasRecord,
  saveCanvas,
  saveCanvasItem,
  saveCanvasLink,
  uid,
} from '../lib/data'
import { richTextPreview } from '../lib/richText'
import type {
  Book,
  Canvas,
  CanvasItem,
  CanvasLink,
  CanvasLinkType,
  LibraryData,
  Note,
} from '../types'

const bookColors = ['#9d4628', '#6e7c62', '#62788b', '#aa7b45', '#765b7c']
const linkLabels: Record<CanvasLinkType, string> = {
  related: 'related to',
  supports: 'supports',
  contradicts: 'contradicts',
  extends: 'extends',
  answers: 'answers',
}

export function ConnectionsHome({
  library,
  user,
  onChange,
  onMessage,
}: ConnectionsProps) {
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const sorted = [...library.canvases].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )

  const createCanvas = async (canvas: Canvas) => {
    onChange({ ...library, canvases: [canvas, ...library.canvases] })
    try {
      await saveCanvas(user, canvas)
    } catch {
      onMessage('Canvas saved locally. Apply the Connections database migration to sync it.')
    }
    navigate(`/connections/${canvas.id}`)
  }

  return (
    <div className="page connections-home">
      <section className="page-title">
        <div>
          <p className="eyebrow">Your thinking spaces</p>
          <h1>Connections</h1>
          <p>Bring related books together, then arrange the ideas that matter.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> New canvas
        </button>
      </section>

      {sorted.length ? (
        <div className="canvas-gallery">
          {sorted.map((canvas) => {
            const books = library.books.filter((book) =>
              canvas.bookIds.includes(book.id),
            )
            const items = library.canvasItems.filter(
              (item) => item.canvasId === canvas.id,
            )
            const links = library.canvasLinks.filter(
              (link) => link.canvasId === canvas.id,
            )
            return (
              <Link
                className="canvas-gallery-card"
                to={`/connections/${canvas.id}`}
                key={canvas.id}
              >
                <CanvasThumbnail items={items} links={links} />
                <div className="canvas-gallery-copy">
                  <p className="eyebrow">{books.length} selected books</p>
                  <h2>{canvas.title}</h2>
                  <p>{canvas.question || 'An open space for connected ideas.'}</p>
                  <div className="canvas-card-footer">
                    <span>{items.length} cards · {links.length} links</span>
                    <ChevronRight size={17} />
                  </div>
                </div>
              </Link>
            )
          })}
          <button className="new-canvas-card" onClick={() => setCreating(true)}>
            <FolderPlus size={28} />
            <strong>Start another canvas</strong>
            <span>Choose a topic, question, or project.</span>
          </button>
        </div>
      ) : (
        <section className="connections-empty">
          <div className="connections-empty-art">
            <div className="empty-node one">A note from one book</div>
            <div className="empty-node two">A thought from another</div>
            <svg viewBox="0 0 500 250"><path d="M145 90 C230 20 260 215 370 150" /></svg>
          </div>
          <div>
            <p className="eyebrow">A quieter kind of canvas</p>
            <h2>Make a space for a question you keep returning to.</h2>
            <p>Select related books, then pull only the notes worth thinking with onto the canvas.</p>
            <button className="button primary" onClick={() => setCreating(true)}>
              Create your first canvas
            </button>
          </div>
        </section>
      )}
      {creating && (
        <CanvasForm
          books={library.books}
          onClose={() => setCreating(false)}
          onSave={createCanvas}
        />
      )}
    </div>
  )
}

export function CanvasWorkspace(props: ConnectionsProps) {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}

function CanvasWorkspaceInner({
  library,
  user,
  onChange,
  onMessage,
}: ConnectionsProps) {
  const { canvasId } = useParams()
  const navigate = useNavigate()
  const canvas = library.canvases.find((item) => item.id === canvasId)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [editingBooks, setEditingBooks] = useState(false)
  const [newItemKind, setNewItemKind] = useState<'text' | 'group' | null>(null)
  const [linkType, setLinkType] = useState<CanvasLinkType>('related')
  const canvasItems = library.canvasItems.filter((item) => item.canvasId === canvasId)
  const canvasLinks = library.canvasLinks.filter((link) => link.canvasId === canvasId)

  const initialNodes = useMemo(
    () => canvasItems.map((item) => itemToNode(item, library)),
    // Initial state only; subsequent changes are controlled locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasId],
  )
  const initialEdges = useMemo(
    () => canvasLinks.map(linkToEdge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasId],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  if (!canvas) {
    return (
      <div className="page">
        <Link className="back-link" to="/connections"><ArrowLeft size={17} /> Back to connections</Link>
        <h1>Canvas not found</h1>
      </div>
    )
  }

  const selectedBooks = library.books.filter((book) =>
    canvas.bookIds.includes(book.id),
  )
  const placedNoteIds = new Set(
    canvasItems.filter((item) => item.noteId).map((item) => item.noteId),
  )
  const availableNotes = library.notes.filter((note) => {
    const book = library.books.find((item) => item.id === note.bookId)
    const haystack = `${richTextPreview(note.content)} ${book?.title ?? ''} ${note.tags.join(' ')}`.toLowerCase()
    return (
      canvas.bookIds.includes(note.bookId) &&
      !placedNoteIds.has(note.id) &&
      haystack.includes(query.toLowerCase())
    )
  })

  const commitItem = async (item: CanvasItem) => {
    onChange({
      ...library,
      canvasItems: library.canvasItems.some((current) => current.id === item.id)
        ? library.canvasItems.map((current) => current.id === item.id ? item : current)
        : [...library.canvasItems, item],
    })
    try {
      await saveCanvasItem(user, item)
    } catch {
      onMessage('Canvas changes are local until the Connections migration is applied.')
    }
  }

  const addNote = (noteId: string, x?: number, y?: number) => {
    const timestamp = new Date().toISOString()
    const noteCount = canvasItems.filter((item) => item.kind === 'note').length
    const autoPlaced = x == null || y == null
    const item: CanvasItem = {
      id: uid(), canvasId: canvas.id, kind: 'note', noteId,
      content: '', label: '',
      x: x ?? 180 + (noteCount % 4) * 310,
      y: y ?? 130 + Math.floor(noteCount / 4) * 220,
      width: 270, height: 170,
      color: colorForBook(library.notes.find((note) => note.id === noteId)?.bookId, canvas.bookIds),
      createdAt: timestamp, updatedAt: timestamp,
    }
    setNodes((current) => [...current, itemToNode(item, library)])
    void commitItem(item)
    if (autoPlaced) window.setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.1 }), 50)
  }

  const addFreeItem = (kind: 'text' | 'group', value: string) => {
    const timestamp = new Date().toISOString()
    const item: CanvasItem = {
      id: uid(), canvasId: canvas.id, kind, noteId: null,
      content: kind === 'text' ? value.trim() : '',
      label: kind === 'group' ? value.trim() : '',
      x: 320 + Math.random() * 180, y: 180 + Math.random() * 160,
      width: kind === 'group' ? 480 : 250,
      height: kind === 'group' ? 300 : 150,
      color: kind === 'group' ? '#9d4628' : '#6e7c62',
      createdAt: timestamp, updatedAt: timestamp,
    }
    setNodes((current) => [...current, itemToNode(item, library)])
    void commitItem(item)
    setNewItemKind(null)
  }

  const onConnect = async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    const link: CanvasLink = {
      id: uid(), canvasId: canvas.id,
      sourceItemId: connection.source, targetItemId: connection.target,
      type: linkType, label: linkLabels[linkType], createdAt: new Date().toISOString(),
    }
    setEdges((current) => addEdge(linkToEdge(link), current))
    onChange({ ...library, canvasLinks: [...library.canvasLinks, link] })
    try {
      await saveCanvasLink(user, link)
    } catch {
      onMessage('Connection saved locally until the Connections migration is applied.')
    }
  }

  const handleNodesChange = (changes: NodeChange<Node<CanvasNodeData>>[]) => {
    onNodesChange(changes)
    changes.forEach((change) => {
      if (
        change.type !== 'dimensions' ||
        change.resizing !== false ||
        !change.dimensions
      ) return
      const existing = library.canvasItems.find((item) => item.id === change.id)
      if (existing) {
        void commitItem({
          ...existing,
          width: change.dimensions.width,
          height: change.dimensions.height,
          updatedAt: new Date().toISOString(),
        })
      }
    })
  }

  const removeSelected = async () => {
    const selectedNodes = nodes.filter((node) => node.selected).map((node) => node.id)
    const selectedEdges = edges.filter((edge) => edge.selected).map((edge) => edge.id)
    if (!selectedNodes.length && !selectedEdges.length) return
    const removedLinks = library.canvasLinks.filter(
      (link) =>
        selectedEdges.includes(link.id) ||
        selectedNodes.includes(link.sourceItemId) ||
        selectedNodes.includes(link.targetItemId),
    )
    setNodes((current) => current.filter((node) => !selectedNodes.includes(node.id)))
    setEdges((current) => current.filter((edge) =>
      !selectedEdges.includes(edge.id) &&
      !selectedNodes.includes(String(edge.source)) &&
      !selectedNodes.includes(String(edge.target)),
    ))
    onChange({
      ...library,
      canvasItems: library.canvasItems.filter((item) => !selectedNodes.includes(item.id)),
      canvasLinks: library.canvasLinks.filter((link) => !removedLinks.some((removed) => removed.id === link.id)),
    })
    await Promise.all([
      ...selectedNodes.map((id) => deleteCanvasRecord(user, 'canvas_items', id).catch(() => undefined)),
      ...removedLinks.map((link) => deleteCanvasRecord(user, 'canvas_links', link.id).catch(() => undefined)),
    ])
  }

  const removeCanvas = async () => {
    if (!window.confirm(`Delete “${canvas.title}”? Your books and notes will not be deleted.`)) return
    onChange({
      ...library,
      canvases: library.canvases.filter((item) => item.id !== canvas.id),
      canvasItems: library.canvasItems.filter((item) => item.canvasId !== canvas.id),
      canvasLinks: library.canvasLinks.filter((link) => link.canvasId !== canvas.id),
    })
    try { await deleteCanvasRecord(user, 'canvases', canvas.id) } catch { /* local deletion still stands */ }
    navigate('/connections')
  }

  return (
    <div className="canvas-workspace">
      <header className="canvas-workspace-header">
        <button className="icon-button" onClick={() => navigate('/connections')}><ArrowLeft size={18} /></button>
        <div className="canvas-title-block">
          <p className="eyebrow">Connections canvas</p>
          <h1>{canvas.title}</h1>
          {canvas.question && <p>{canvas.question}</p>}
        </div>
        <div className="selected-books">
          {selectedBooks.slice(0, 5).map((book, index) => (
            <button key={book.id} title={book.title} style={{ '--book-color': bookColors[index % bookColors.length] } as React.CSSProperties}>
              {book.title.slice(0, 2).toUpperCase()}
            </button>
          ))}
          <button className="add-books-chip" onClick={() => setEditingBooks(true)}>+ Books</button>
        </div>
        <div className="canvas-toolbar">
          <button className="button subtle compact" onClick={() => setNewItemKind('text')}><StickyNote size={15} /> Thought</button>
          <button className="button subtle compact" onClick={() => setNewItemKind('group')}><Group size={15} /> Group</button>
          <select value={linkType} onChange={(event) => setLinkType(event.target.value as CanvasLinkType)} aria-label="Connection type">
            {Object.entries(linkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="icon-button" title="Fit all" onClick={() => fitView({ padding: 0.2 })}><Layers3 size={17} /></button>
          <button className="icon-button" title="Delete selected" onClick={removeSelected}><Trash2 size={17} /></button>
          <button className="icon-button" title="Delete canvas" onClick={removeCanvas}><FolderX size={17} /></button>
        </div>
      </header>
      <div className="canvas-body">
        <aside className={`notes-drawer ${drawerOpen ? 'open' : ''}`}>
          <button className="drawer-toggle" onClick={() => setDrawerOpen(!drawerOpen)}>
            <BookMarked size={17} /> {drawerOpen ? <X size={15} /> : null}
          </button>
          {drawerOpen && (
            <>
              <div className="drawer-heading">
                <p className="eyebrow">From selected books</p>
                <h2>Available notes</h2>
                <p>Drag a note onto the canvas. It remains reusable elsewhere.</p>
              </div>
              <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes…" /></label>
              <div className="drawer-note-list">
                {availableNotes.map((note) => {
                  const book = library.books.find((item) => item.id === note.bookId)
                  return (
                    <article
                      key={note.id}
                      className="drawer-note"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('application/shelf-note', note.id)}
                    >
                      <span style={{ background: colorForBook(note.bookId, canvas.bookIds) }} />
                      <p>{book?.title} · {pageText(note)}</p>
                      <strong>{richTextPreview(note.content)}</strong>
                      <button onClick={() => addNote(note.id)}><Plus size={15} /></button>
                    </article>
                  )
                })}
                {!availableNotes.length && <p className="drawer-empty">All matching notes are already placed.</p>}
              </div>
            </>
          )}
        </aside>
        <div className="flow-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={(_event, node) => {
              const existing = library.canvasItems.find((item) => item.id === node.id)
              if (existing) void commitItem({ ...existing, x: node.position.x, y: node.position.y, updatedAt: new Date().toISOString() })
            }}
            onDrop={(event) => {
              event.preventDefault()
              const noteId = event.dataTransfer.getData('application/shelf-note')
              if (!noteId) return
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
              addNote(noteId, position.x, position.y)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
            minZoom={0.25}
            maxZoom={2}
            deleteKeyCode={null}
          >
            <Background color="#c9c0b1" gap={22} size={1} />
            <Controls position="bottom-right" />
            <MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
        </div>
      </div>
      {editingBooks && (
        <BookPicker
          canvas={canvas}
          books={library.books}
          onClose={() => setEditingBooks(false)}
          onSave={async (bookIds) => {
            const updated = { ...canvas, bookIds, updatedAt: new Date().toISOString() }
            onChange({ ...library, canvases: library.canvases.map((item) => item.id === canvas.id ? updated : item) })
            setEditingBooks(false)
            try { await saveCanvas(user, updated) } catch { onMessage('Book selection saved locally.') }
          }}
        />
      )}
      {newItemKind && (
        <CanvasItemForm
          kind={newItemKind}
          onClose={() => setNewItemKind(null)}
          onSave={(value) => addFreeItem(newItemKind, value)}
        />
      )}
    </div>
  )
}

type ConnectionsProps = {
  library: LibraryData
  user: User | null
  onChange: (library: LibraryData) => void
  onMessage: (message: string) => void
}

type CanvasNodeData = {
  kind: CanvasItem['kind']
  note?: Note
  book?: Book
  content: string
  label: string
  color: string
}

const nodeTypes = {
  noteCard: CanvasNode,
  textCard: CanvasNode,
  groupCard: CanvasNode,
}

function CanvasNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const isGroup = data.kind === 'group'
  return (
    <div className={`flow-node ${data.kind} ${selected ? 'selected' : ''}`} style={{ '--node-color': data.color } as React.CSSProperties}>
      <NodeResizer isVisible={selected} minWidth={isGroup ? 260 : 210} minHeight={isGroup ? 180 : 120} />
      {!isGroup && <><Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} /></>}
      {isGroup ? (
        <strong className="group-label">{data.label}</strong>
      ) : data.kind === 'note' ? (
        <>
          <p className="flow-node-meta">{data.book?.title} · {data.note ? pageText(data.note) : ''}</p>
          <strong>{data.note ? richTextPreview(data.note.content) : ''}</strong>
          <div className="flow-node-tags">{data.note?.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
        </>
      ) : (
        <>
          <p className="flow-node-meta">Canvas thought</p>
          <strong>{data.content}</strong>
        </>
      )}
    </div>
  )
}

function itemToNode(item: CanvasItem, library: LibraryData): Node<CanvasNodeData> {
  const note = item.noteId ? library.notes.find((current) => current.id === item.noteId) : undefined
  const book = note ? library.books.find((current) => current.id === note.bookId) : undefined
  return {
    id: item.id,
    type: item.kind === 'note' ? 'noteCard' : item.kind === 'text' ? 'textCard' : 'groupCard',
    position: { x: item.x, y: item.y },
    style: { width: item.width, height: item.height, zIndex: item.kind === 'group' ? -1 : 2 },
    data: { kind: item.kind, note, book, content: item.content, label: item.label, color: item.color },
  }
}

function linkToEdge(link: CanvasLink): Edge {
  return {
    id: link.id, source: link.sourceItemId, target: link.targetItemId,
    label: link.label || linkLabels[link.type], type: 'bezier',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9d4628' },
    style: { stroke: link.type === 'contradicts' ? '#9a4b48' : '#9d6249', strokeWidth: 1.6 },
    labelStyle: { fill: '#7d4b37', fontSize: 11, fontFamily: 'DM Mono' },
    labelBgStyle: { fill: '#f4f0e7', fillOpacity: 0.92 },
  }
}

function CanvasForm({ books, onClose, onSave }: { books: Book[]; onClose: () => void; onSave: (canvas: Canvas) => void }) {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [bookIds, setBookIds] = useState<string[]>([])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const timestamp = new Date().toISOString()
    onSave({ id: uid(), title: title.trim(), question: question.trim(), bookIds, createdAt: timestamp, updatedAt: timestamp })
  }
  return (
    <Dialog title="Create a canvas" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Canvas name<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Consciousness & Identity" /></label>
        <label>Guiding question<input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What am I trying to understand?" /></label>
        <BookCheckboxes books={books} selected={bookIds} onChange={setBookIds} />
        <div className="form-actions"><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary">Create canvas</button></div>
      </form>
    </Dialog>
  )
}

function BookPicker({ canvas, books, onClose, onSave }: { canvas: Canvas; books: Book[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [selected, setSelected] = useState(canvas.bookIds)
  return (
    <Dialog title="Books available to this canvas" onClose={onClose}>
      <div className="form">
        <BookCheckboxes books={books} selected={selected} onChange={setSelected} />
        <div className="form-actions"><button className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onSave(selected)}>Save books</button></div>
      </div>
    </Dialog>
  )
}

function CanvasItemForm({ kind, onClose, onSave }: { kind: 'text' | 'group'; onClose: () => void; onSave: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog title={kind === 'text' ? 'Add a canvas thought' : 'Create a group'} onClose={onClose}>
      <form className="form" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value.trim()) }}>
        <label>
          {kind === 'text' ? 'Your emerging thought' : 'Group label'}
          {kind === 'text'
            ? <textarea autoFocus rows={5} value={value} onChange={(event) => setValue(event.target.value)} placeholder="What is beginning to connect?" />
            : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Evidence, Questions, Contradictions…" />}
        </label>
        <div className="form-actions"><button type="button" className="button subtle" onClick={onClose}>Cancel</button><button className="button primary">Add to canvas</button></div>
      </form>
    </Dialog>
  )
}

function BookCheckboxes({ books, selected, onChange }: { books: Book[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset className="book-checkboxes">
      <legend>Select books</legend>
      {books.map((book, index) => (
        <label key={book.id}>
          <input type="checkbox" checked={selected.includes(book.id)} onChange={() => onChange(selected.includes(book.id) ? selected.filter((id) => id !== book.id) : [...selected, book.id])} />
          <span style={{ background: bookColors[index % bookColors.length] }}>{book.title.slice(0, 2).toUpperCase()}</span>
          <strong>{book.title}<small>{book.author}</small></strong>
        </label>
      ))}
    </fieldset>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </section>
    </div>
  )
}

function CanvasThumbnail({ items, links }: { items: CanvasItem[]; links: CanvasLink[] }) {
  return (
    <div className="canvas-thumbnail">
      <svg viewBox="0 0 400 220">
        {links.slice(0, 6).map((link, index) => <path key={link.id} d={`M${70 + index * 35} ${65 + (index % 2) * 70} C180 30 210 190 ${300 - index * 15} ${90 + (index % 3) * 35}`} />)}
      </svg>
      {items.slice(0, 6).map((item, index) => (
        <span key={item.id} style={{ left: `${12 + (index * 17) % 66}%`, top: `${15 + (index * 29) % 60}%`, borderColor: item.color }} />
      ))}
    </div>
  )
}

function colorForBook(bookId: string | undefined, bookIds: string[]) {
  const index = Math.max(0, bookIds.indexOf(bookId ?? ''))
  return bookColors[index % bookColors.length]
}

function pageText(note: Note) {
  if (note.pageStart == null) return 'no page'
  return note.pageEnd && note.pageEnd !== note.pageStart ? `pp. ${note.pageStart}–${note.pageEnd}` : `p. ${note.pageStart}`
}
