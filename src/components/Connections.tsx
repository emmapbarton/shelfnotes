import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
  type OnConnectStartParams,
  type FinalConnectionState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft,
  AlignHorizontalDistributeCenter,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  FolderX,
  Group,
  Layers3,
  Lock,
  Pencil,
  Plus,
  Redo2,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  Unlock,
  WandSparkles,
  XCircle,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteCanvasRecord,
  saveCanvas,
  saveCanvasItem,
  saveCanvasLink,
  saveNote,
  uid,
} from '../lib/data'
import { richTextPreview } from '../lib/richText'
import { RichContent, RichTextEditor } from './RichTextEditor'
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

type CanvasSnapshot = {
  items: CanvasItem[]
  links: CanvasLink[]
}

const cloneSnapshot = (snapshot: CanvasSnapshot): CanvasSnapshot => ({
  items: snapshot.items.map((item) => ({ ...item })),
  links: snapshot.links.map((link) => ({ ...link })),
})

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
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow()
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [editingBooks, setEditingBooks] = useState(false)
  const [newItemKind, setNewItemKind] = useState<'text' | 'group' | null>(null)
  const [linkType, setLinkType] = useState<CanvasLinkType>('related')
  const [arrangeOpen, setArrangeOpen] = useState(false)
  const [pendingNote, setPendingNote] = useState<{
    noteId: string
    x?: number
    y?: number
  } | null>(null)
  const [inspectorItemId, setInspectorItemId] = useState<string | null>(null)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [selectionOrder, setSelectionOrder] = useState<string[]>([])
  const undoStack = useRef<CanvasSnapshot[]>([])
  const redoStack = useRef<CanvasSnapshot[]>([])
  const dragSnapshot = useRef<CanvasSnapshot | null>(null)
  const resizeSnapshot = useRef<CanvasSnapshot | null>(null)
  const connectingFrom = useRef<string | null>(null)
  const connectionCompleted = useRef(false)
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

  const snapshotCanvas = useCallback((): CanvasSnapshot => {
    const currentNodes = getNodes()
    const nodeById = new Map(currentNodes.map((node) => [node.id, node]))
    return cloneSnapshot({
      items: library.canvasItems
        .filter((item) => item.canvasId === canvasId)
        .map((item) => {
          const node = nodeById.get(item.id)
          return node ? {
            ...item,
            x: node.position.x,
            y: node.position.y,
            width: node.measured?.width ?? (Number(node.style?.width) || item.width),
            height: node.measured?.height ?? (Number(node.style?.height) || item.height),
          } : item
        }),
      links: library.canvasLinks.filter((link) => link.canvasId === canvasId),
    })
  }, [canvasId, getNodes, library.canvasItems, library.canvasLinks])

  const remember = useCallback((snapshot: CanvasSnapshot) => {
    undoStack.current.push(cloneSnapshot(snapshot))
    if (undoStack.current.length > 60) undoStack.current.shift()
    redoStack.current = []
    setHistoryVersion((value) => value + 1)
  }, [])

  const applySnapshot = useCallback(async (snapshot: CanvasSnapshot) => {
    const currentItems = library.canvasItems.filter((item) => item.canvasId === canvasId)
    const currentLinks = library.canvasLinks.filter((link) => link.canvasId === canvasId)
    const itemIds = new Set(snapshot.items.map((item) => item.id))
    const linkIds = new Set(snapshot.links.map((link) => link.id))
    onChange({
      ...library,
      canvasItems: [
        ...library.canvasItems.filter((item) => item.canvasId !== canvasId),
        ...snapshot.items,
      ],
      canvasLinks: [
        ...library.canvasLinks.filter((link) => link.canvasId !== canvasId),
        ...snapshot.links,
      ],
    })
    setNodes(snapshot.items.map((item) => itemToNode(item, library)))
    setEdges(snapshot.links.map(linkToEdge))
    setSelectionOrder([])
    await Promise.all(currentLinks
      .filter((link) => !linkIds.has(link.id))
      .map((link) => deleteCanvasRecord(user, 'canvas_links', link.id).catch(() => undefined)))
    await Promise.all(currentItems
      .filter((item) => !itemIds.has(item.id))
      .map((item) => deleteCanvasRecord(user, 'canvas_items', item.id).catch(() => undefined)))
    await Promise.all(snapshot.items.map((item) =>
      saveCanvasItem(user, item).catch(() => undefined),
    ))
    await Promise.all(snapshot.links.map((link) =>
      saveCanvasLink(user, link).catch(() => undefined),
    ))
  }, [canvasId, library, onChange, setEdges, setNodes, user])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(snapshotCanvas())
    void applySnapshot(previous)
    setHistoryVersion((value) => value + 1)
  }, [applySnapshot, snapshotCanvas])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(snapshotCanvas())
    void applySnapshot(next)
    setHistoryVersion((value) => value + 1)
  }, [applySnapshot, snapshotCanvas])

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

  const commitItems = async (items: CanvasItem[]) => {
    if (!items.length) return
    const changed = new Map(items.map((item) => [item.id, item]))
    onChange({
      ...library,
      canvasItems: library.canvasItems.map((item) => changed.get(item.id) ?? item),
    })
    await Promise.all(items.map((item) =>
      saveCanvasItem(user, item).catch(() => {
        onMessage('Canvas changes are saved on this device.')
      }),
    ))
  }

  const addNote = (noteId: string, label: string, x?: number, y?: number) => {
    remember(snapshotCanvas())
    const timestamp = new Date().toISOString()
    const noteCount = canvasItems.filter((item) => item.kind === 'note').length
    const autoPlaced = x == null || y == null
    const item: CanvasItem = {
      id: uid(), canvasId: canvas.id, kind: 'note', noteId,
      content: '', label: label.trim(),
      x: x ?? 180 + (noteCount % 4) * 310,
      y: y ?? 130 + Math.floor(noteCount / 4) * 220,
      width: 270, height: 170,
      color: colorForBook(library.notes.find((note) => note.id === noteId)?.bookId, canvas.bookIds),
      compact: false,
      createdAt: timestamp, updatedAt: timestamp,
    }
    setNodes((current) => [...current, itemToNode(item, library)])
    void commitItem(item)
    if (autoPlaced) window.setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.1 }), 50)
  }

  const promptForNote = (noteId: string, x?: number, y?: number) => {
    setPendingNote({ noteId, x, y })
  }

  const addFreeItem = (kind: 'text' | 'group', value: string) => {
    remember(snapshotCanvas())
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

  const createLink = async (source: string, target: string) => {
    if (
      source === target ||
      library.canvasLinks.some((link) =>
        link.canvasId === canvas?.id &&
        link.sourceItemId === source &&
        link.targetItemId === target,
      )
    ) return
    remember(snapshotCanvas())
    const link: CanvasLink = {
      id: uid(), canvasId: canvas.id,
      sourceItemId: source, targetItemId: target,
      type: linkType, label: linkLabels[linkType], createdAt: new Date().toISOString(),
    }
    setEdges((current) => addEdge(linkToEdge(link), current))
    onChange({ ...library, canvasLinks: [...library.canvasLinks, link] })
    try {
      await saveCanvasLink(user, link)
    } catch {
      onMessage('Connection saved on this device.')
    }
  }

  const onConnect = (connection: Connection) => {
    if (connection.source && connection.target) {
      connectionCompleted.current = true
      void createLink(connection.source, connection.target)
    }
  }

  const updateCanvasItem = (item: CanvasItem) => {
    remember(snapshotCanvas())
    setNodes((current) => current.map((node) =>
      node.id === item.id ? itemToNode(item, library) : node,
    ))
    void commitItem(item)
  }

  const updateLink = async (link: CanvasLink) => {
    remember(snapshotCanvas())
    setEdges((current) => current.map((edge) =>
      edge.id === link.id ? { ...linkToEdge(link), selected: true } : edge,
    ))
    onChange({
      ...library,
      canvasLinks: library.canvasLinks.map((current) =>
        current.id === link.id ? link : current,
      ),
    })
    try {
      await saveCanvasLink(user, link)
    } catch {
      onMessage('Connection changes are saved on this device.')
    }
  }

  const deleteLink = async (linkId: string) => {
    remember(snapshotCanvas())
    setEdges((current) => current.filter((edge) => edge.id !== linkId))
    onChange({
      ...library,
      canvasLinks: library.canvasLinks.filter((link) => link.id !== linkId),
    })
    setEditingLinkId(null)
    await deleteCanvasRecord(user, 'canvas_links', linkId).catch(() => undefined)
  }

  const saveOriginalNote = async (note: Note) => {
    onChange({
      ...library,
      notes: library.notes.map((current) => current.id === note.id ? note : current),
    })
    setNodes((current) => current.map((node) =>
      node.data.note?.id === note.id
        ? { ...node, data: { ...node.data, note } }
        : node,
    ))
    try {
      await saveNote(user, note)
      onMessage('Note updated.')
    } catch {
      onMessage('Note updated on this device.')
    }
  }

  const handleNodesChange = (changes: NodeChange<Node<CanvasNodeData>>[]) => {
    if (
      !resizeSnapshot.current &&
      changes.some((change) => change.type === 'dimensions' && change.resizing)
    ) {
      resizeSnapshot.current = snapshotCanvas()
    }
    onNodesChange(changes)
    changes.forEach((change) => {
      if (
        change.type !== 'dimensions' ||
        change.resizing !== false ||
        !change.dimensions
      ) return
      const existing = library.canvasItems.find((item) => item.id === change.id)
      if (existing) {
        if (resizeSnapshot.current) {
          remember(resizeSnapshot.current)
          resizeSnapshot.current = null
        }
        void commitItem({
          ...existing,
          width: change.dimensions.width,
          height: change.dimensions.height,
          updatedAt: new Date().toISOString(),
        })
      }
    })
  }

  const handleSelectionChange = ({
    nodes: selectedNodes,
  }: OnSelectionChangeParams<Node<CanvasNodeData>, Edge>) => {
    const selectedIds = selectedNodes.map((node) => node.id)
    setSelectionOrder((current) => [
      ...current.filter((id) => selectedIds.includes(id)),
      ...selectedIds.filter((id) => !current.includes(id)),
    ])
  }

  const connectSelected = () => {
    const connectable = selectionOrder.filter((id) => {
      const node = nodes.find((item) => item.id === id)
      return node?.data.kind !== 'group' && node?.selected
    })
    if (connectable.length !== 2) {
      onMessage('Select exactly two cards, then press L to connect them.')
      return
    }
    void createLink(connectable[0], connectable[1])
  }

  const toggleSelectedLock = () => {
    const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id)
    if (!selectedIds.length) return
    const selectedItems = canvasItems.filter((item) => selectedIds.includes(item.id))
    const shouldLock = selectedItems.some((item) => !item.locked)
    remember(snapshotCanvas())
    const timestamp = new Date().toISOString()
    const updated = selectedItems.map((item) => ({
      ...item,
      locked: shouldLock,
      updatedAt: timestamp,
    }))
    const changed = new Map(updated.map((item) => [item.id, item]))
    setNodes((current) => current.map((node) =>
      changed.has(node.id)
        ? { ...node, draggable: !shouldLock, data: { ...node.data, locked: shouldLock } }
        : node,
    ))
    void commitItems(updated)
  }

  const arrangeCanvas = (mode: 'overlap' | 'hierarchy') => {
    const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id)
    const scopedIds = selectedIds.length > 1
      ? new Set(selectedIds)
      : new Set(nodes.filter((node) => node.data.kind !== 'group').map((node) => node.id))
    const movableIds = new Set(
      canvasItems
        .filter((item) => scopedIds.has(item.id) && !item.locked && item.kind !== 'group')
        .map((item) => item.id),
    )
    if (movableIds.size < 2) {
      onMessage('Select at least two unlocked cards to arrange.')
      return
    }
    remember(snapshotCanvas())
    const arranged = mode === 'overlap'
      ? removeNodeOverlaps(nodes, movableIds)
      : arrangeNodeHierarchy(nodes, edges, movableIds)
    setNodes(arranged)
    const timestamp = new Date().toISOString()
    const arrangedById = new Map(arranged.map((node) => [node.id, node]))
    const updatedItems = canvasItems
      .filter((item) => movableIds.has(item.id))
      .map((item) => {
        const node = arrangedById.get(item.id)!
        return { ...item, x: node.position.x, y: node.position.y, updatedAt: timestamp }
      })
    void commitItems(updatedItems)
    setArrangeOpen(false)
    window.setTimeout(() => fitView({ nodes: arranged.filter((node) => scopedIds.has(node.id)), padding: 0.18, maxZoom: 1.15 }), 50)
  }

  const clearSelection = () => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setSelectionOrder([])
  }

  const handleConnectStart = (
    _event: MouseEvent | TouchEvent,
    params: OnConnectStartParams,
  ) => {
    connectingFrom.current = params.nodeId
    connectionCompleted.current = false
  }

  const handleConnectEnd = (
    event: MouseEvent | TouchEvent,
    state: FinalConnectionState,
  ) => {
    const sourceId = connectingFrom.current
    connectingFrom.current = null
    if (!sourceId || connectionCompleted.current || state.isValid) return
    const point = 'changedTouches' in event
      ? event.changedTouches[0]
      : event
    const target = document
      .elementsFromPoint(point.clientX, point.clientY)
      .map((element) => element.closest<HTMLElement>('.react-flow__node'))
      .find(Boolean)
    const targetId = target?.dataset.id
    if (!targetId || targetId === sourceId) return
    const targetNode = nodes.find((node) => node.id === targetId)
    if (targetNode?.data.kind === 'group') return
    void createLink(sourceId, targetId)
  }

  const removeSelected = async () => {
    const selectedNodes = nodes.filter((node) => node.selected).map((node) => node.id)
    const selectedEdges = edges.filter((edge) => edge.selected).map((edge) => edge.id)
    if (!selectedNodes.length && !selectedEdges.length) return
    remember(snapshotCanvas())
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

  const removeItem = async (itemId: string) => {
    remember(snapshotCanvas())
    const relatedLinks = library.canvasLinks.filter((link) =>
      link.sourceItemId === itemId || link.targetItemId === itemId,
    )
    setNodes((current) => current.filter((node) => node.id !== itemId))
    setEdges((current) => current.filter((edge) =>
      edge.source !== itemId && edge.target !== itemId,
    ))
    onChange({
      ...library,
      canvasItems: library.canvasItems.filter((item) => item.id !== itemId),
      canvasLinks: library.canvasLinks.filter((link) =>
        !relatedLinks.some((related) => related.id === link.id),
      ),
    })
    await Promise.all([
      deleteCanvasRecord(user, 'canvas_items', itemId).catch(() => undefined),
      ...relatedLinks.map((link) =>
        deleteCanvasRecord(user, 'canvas_links', link.id).catch(() => undefined),
      ),
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

  const selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id)
  const selectedItems = canvasItems.filter((item) => selectedNodeIds.includes(item.id))
  const selectionIsLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)
  const selectedEdge = edges.find((edge) => edge.selected)
  const inspectorItem = canvasItems.find((item) => item.id === inspectorItemId)
  const inspectorNote = inspectorItem?.noteId
    ? library.notes.find((note) => note.id === inspectorItem.noteId)
    : undefined
  const inspectorBook = inspectorNote
    ? library.books.find((book) => book.id === inspectorNote.bookId)
    : undefined
  const editingLink = library.canvasLinks.find((link) =>
    link.id === (editingLinkId ?? selectedEdge?.id),
  )
  const displayNodes = selectedEdge
    ? nodes.map((node) => ({
        ...node,
        className: node.id === selectedEdge.source || node.id === selectedEdge.target
          ? 'connection-endpoint'
          : 'connection-muted',
      }))
    : nodes
  const canUndo = historyVersion >= 0 && undoStack.current.length > 0
  const canRedo = historyVersion >= 0 && redoStack.current.length > 0

  return (
    <div
      className="canvas-workspace"
      tabIndex={0}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement
        if (!target.closest('input, textarea, select')) event.currentTarget.focus()
        const nodeElement = target.closest<HTMLElement>('.react-flow__node')
        const nodeId = nodeElement?.dataset.id
        if (event.shiftKey && nodeId) {
          const selectedBefore = new Set(
            nodes.filter((node) => node.selected).map((node) => node.id),
          )
          const wasSelected = selectedBefore.has(nodeId)
          window.setTimeout(() => {
            setNodes((current) => current.map((node) => ({
              ...node,
              selected: node.id === nodeId
                ? !wasSelected
                : selectedBefore.has(node.id),
            })))
          }, 0)
        }
      }}
      onPointerUpCapture={(event) => {
        const sourceId = connectingFrom.current
        const targetId = (event.target as HTMLElement)
          .closest<HTMLElement>('.react-flow__node')
          ?.dataset.id
        if (!sourceId || !targetId || sourceId === targetId) return
        const targetNode = nodes.find((node) => node.id === targetId)
        if (targetNode?.data.kind === 'group') return
        window.setTimeout(() => {
          if (!connectionCompleted.current) void createLink(sourceId, targetId)
        }, 0)
      }}
    >
      <CanvasKeyboardShortcuts
        onUndo={undo}
        onRedo={redo}
        onLink={connectSelected}
        onEscape={clearSelection}
      />
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
          <div className="canvas-history-controls">
            <button className="icon-button" disabled={!canUndo} title="Undo (Ctrl/Cmd + Z)" onClick={undo}><Undo2 size={16} /></button>
            <button className="icon-button" disabled={!canRedo} title="Redo (Ctrl/Cmd + Shift + Z)" onClick={redo}><Redo2 size={16} /></button>
          </div>
          <button className="button subtle compact" onClick={() => setNewItemKind('text')}><StickyNote size={15} /> Thought</button>
          <button className="button subtle compact" onClick={() => setNewItemKind('group')}><Group size={15} /> Group</button>
          <select value={linkType} onChange={(event) => setLinkType(event.target.value as CanvasLinkType)} aria-label="Connection type">
            {Object.entries(linkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="button subtle compact" disabled={selectedNodeIds.length !== 2} title="Connect two selected cards (L)" onClick={connectSelected}>
            <span>Link</span><kbd>L</kbd>
          </button>
          <button className="icon-button" disabled={!selectedNodeIds.length} title={selectionIsLocked ? 'Unlock selected cards' : 'Lock selected cards'} onClick={toggleSelectedLock}>
            {selectionIsLocked ? <Unlock size={16} /> : <Lock size={16} />}
          </button>
          <div className="arrange-control">
            <button className="button subtle compact" onClick={() => setArrangeOpen(!arrangeOpen)}>
              <WandSparkles size={15} /> Arrange <ChevronDown size={13} />
            </button>
            {arrangeOpen && (
              <div className="arrange-menu">
                <p>{selectedNodeIds.length > 1 ? `Arrange ${selectedNodeIds.length} selected cards` : 'Arrange all unlocked cards'}</p>
                <button onClick={() => arrangeCanvas('overlap')}>
                  <AlignHorizontalDistributeCenter size={17} />
                  <span><strong>Remove overlaps</strong><small>Keep the rough shape, add breathing room.</small></span>
                </button>
                <button onClick={() => arrangeCanvas('hierarchy')}>
                  <Layers3 size={17} />
                  <span><strong>Hierarchy</strong><small>Follow the direction of your connections.</small></span>
                </button>
              </div>
            )}
          </div>
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
                      <button onClick={() => promptForNote(note.id)}><Plus size={15} /></button>
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
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={handleSelectionChange}
            onConnect={onConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onNodeClick={(_event, node) => {
              if (node.data.kind !== 'note') return
              setInspectorItemId(node.id)
              setEditingLinkId(null)
            }}
            onEdgeClick={(_event, edge) => {
              setEditingLinkId(edge.id)
              setInspectorItemId(null)
            }}
            onNodeDragStart={() => {
              dragSnapshot.current = snapshotCanvas()
            }}
            onNodeDragStop={() => {
              if (dragSnapshot.current) {
                remember(dragSnapshot.current)
                dragSnapshot.current = null
              }
              const timestamp = new Date().toISOString()
              const currentNodes = getNodes()
              const currentById = new Map(currentNodes.map((node) => [node.id, node]))
              const movedItems = canvasItems
                .filter((item) => currentById.has(item.id))
                .map((item) => {
                  const node = currentById.get(item.id)!
                  return { ...item, x: node.position.x, y: node.position.y, updatedAt: timestamp }
                })
              void commitItems(movedItems)
            }}
            onDrop={(event) => {
              event.preventDefault()
              const noteId = event.dataTransfer.getData('application/shelf-note')
              if (!noteId) return
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
              promptForNote(noteId, position.x, position.y)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
            minZoom={0.25}
            maxZoom={2}
            panOnScroll
            zoomOnPinch
            panOnDrag={[1, 2]}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Shift"
            selectionKeyCode={null}
            deleteKeyCode={null}
          >
            <Background color="#c9c0b1" gap={22} size={1} />
            <Controls position="bottom-right" />
            <MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
          {inspectorItem && inspectorNote && inspectorBook && (
            <NoteInspector
              item={inspectorItem}
              note={inspectorNote}
              book={inspectorBook}
              user={user}
              onClose={() => setInspectorItemId(null)}
              onSaveItem={(updated) => updateCanvasItem(updated)}
              onSaveNote={saveOriginalNote}
              onRemove={() => {
                void removeItem(inspectorItem.id)
                setInspectorItemId(null)
              }}
            />
          )}
          {editingLink && (
            <ConnectionEditor
              link={editingLink}
              onClose={() => {
                setEditingLinkId(null)
                setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
              }}
              onSave={updateLink}
              onDelete={() => void deleteLink(editingLink.id)}
            />
          )}
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
      {pendingNote && (
        <NoteHeadingPrompt
          note={library.notes.find((note) => note.id === pendingNote.noteId)}
          onClose={() => setPendingNote(null)}
          onAdd={(heading) => {
            addNote(pendingNote.noteId, heading, pendingNote.x, pendingNote.y)
            setPendingNote(null)
          }}
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
  locked: boolean
  compact: boolean
}

const nodeTypes = {
  noteCard: CanvasNode,
  textCard: CanvasNode,
  groupCard: CanvasNode,
}

function CanvasKeyboardShortcuts({
  onUndo,
  onRedo,
  onLink,
  onEscape,
}: {
  onUndo: () => void
  onRedo: () => void
  onLink: () => void
  onEscape: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
      } else if (!modifier && !event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        onLink()
      } else if (event.key === 'Escape') {
        onEscape()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape, onLink, onRedo, onUndo])
  return null
}

function CanvasNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const isGroup = data.kind === 'group'
  return (
    <div className={`flow-node ${data.kind} ${selected ? 'selected' : ''} ${data.locked ? 'locked' : ''}`} style={{ '--node-color': data.color } as React.CSSProperties}>
      <NodeResizer isVisible={selected && !data.locked} minWidth={isGroup ? 260 : 210} minHeight={isGroup ? 180 : 120} />
      {data.locked && <span className="node-lock" title="This card is locked"><Lock size={12} /></span>}
      {!isGroup && <>
        <Handle id="target" type="target" position={Position.Left} />
        <Handle id="source" type="source" position={Position.Right} />
      </>}
      {isGroup ? (
        <strong className="group-label">{data.label}</strong>
      ) : data.kind === 'note' ? (
        <>
          <p className="flow-node-meta">{data.book?.title} · {data.note ? pageText(data.note) : ''}</p>
          <strong className={`flow-node-heading ${data.label ? '' : 'empty'}`}>
            {data.label || 'Add a key point…'}
          </strong>
          {!data.compact && (
            <>
              <p className="flow-node-preview">{data.note ? richTextPreview(data.note.content) : ''}</p>
              <div className="flow-node-tags">{data.note?.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
            </>
          )}
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
    draggable: !item.locked,
    data: {
      kind: item.kind,
      note,
      book,
      content: item.content,
      label: item.label,
      color: item.color,
      locked: item.locked ?? false,
      compact: item.compact ?? false,
    },
  }
}

function linkToEdge(link: CanvasLink): Edge {
  return {
    id: link.id, source: link.sourceItemId, target: link.targetItemId,
    label: link.label || linkLabels[link.type], type: 'default',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#9d4628' },
    style: { stroke: link.type === 'contradicts' ? '#9a4b48' : '#9d6249', strokeWidth: 1.6 },
    labelStyle: { fill: '#7d4b37', fontSize: 11, fontFamily: 'DM Mono' },
    labelBgStyle: { fill: '#f4f0e7', fillOpacity: 0.92 },
  }
}

function nodeDimensions(node: Node<CanvasNodeData>) {
  return {
    width: node.measured?.width ?? (Number(node.style?.width) || 270),
    height: node.measured?.height ?? (Number(node.style?.height) || 170),
  }
}

function nodesOverlap(a: Node<CanvasNodeData>, b: Node<CanvasNodeData>, gap = 28) {
  const aSize = nodeDimensions(a)
  const bSize = nodeDimensions(b)
  return !(
    a.position.x + aSize.width + gap <= b.position.x ||
    b.position.x + bSize.width + gap <= a.position.x ||
    a.position.y + aSize.height + gap <= b.position.y ||
    b.position.y + bSize.height + gap <= a.position.y
  )
}

function removeNodeOverlaps(
  nodes: Node<CanvasNodeData>[],
  movableIds: Set<string>,
) {
  const arranged = nodes.map((node) => ({ ...node, position: { ...node.position } }))
  const movable = arranged
    .filter((node) => movableIds.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)

  movable.forEach((node) => {
    let attempts = 0
    while (attempts < 80) {
      const collision = arranged.find((other) =>
        other.id !== node.id && nodesOverlap(node, other),
      )
      if (!collision) break
      const otherSize = nodeDimensions(collision)
      const moveRight = collision.position.x + otherSize.width + 34 - node.position.x
      const moveDown = collision.position.y + otherSize.height + 34 - node.position.y
      if (moveRight < moveDown) node.position.x += Math.max(24, moveRight)
      else node.position.y += Math.max(24, moveDown)
      attempts += 1
    }
  })
  return arranged
}

function arrangeNodeHierarchy(
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  movableIds: Set<string>,
) {
  const scopedNodes = nodes.filter((node) => movableIds.has(node.id))
  const indegree = new Map(scopedNodes.map((node) => [node.id, 0]))
  const outgoing = new Map(scopedNodes.map((node) => [node.id, [] as string[]]))
  edges.forEach((edge) => {
    if (!movableIds.has(String(edge.source)) || !movableIds.has(String(edge.target))) return
    outgoing.get(String(edge.source))?.push(String(edge.target))
    indegree.set(String(edge.target), (indegree.get(String(edge.target)) ?? 0) + 1)
  })

  const layers = new Map<string, number>()
  const queue = scopedNodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
  queue.forEach((id) => layers.set(id, 0))
  while (queue.length) {
    const id = queue.shift()!
    const nextLayer = (layers.get(id) ?? 0) + 1
    outgoing.get(id)?.forEach((target) => {
      layers.set(target, Math.max(layers.get(target) ?? 0, nextLayer))
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if (indegree.get(target) === 0) queue.push(target)
    })
  }
  scopedNodes.forEach((node) => {
    if (!layers.has(node.id)) layers.set(node.id, 0)
  })

  const originX = Math.min(...scopedNodes.map((node) => node.position.x))
  const originY = Math.min(...scopedNodes.map((node) => node.position.y))
  const columns = new Map<number, Node<CanvasNodeData>[]>()
  scopedNodes.forEach((node) => {
    const layer = layers.get(node.id) ?? 0
    columns.set(layer, [...(columns.get(layer) ?? []), node])
  })
  const positions = new Map<string, { x: number; y: number }>()
  let columnX = originX
  ;[...columns.entries()].sort(([a], [b]) => a - b).forEach(([, column]) => {
    let rowY = originY
    const widest = Math.max(...column.map((node) => nodeDimensions(node).width))
    column
      .sort((a, b) => a.position.y - b.position.y)
      .forEach((node) => {
        positions.set(node.id, { x: columnX, y: rowY })
        rowY += nodeDimensions(node).height + 70
      })
    columnX += widest + 130
  })

  return removeNodeOverlaps(
    nodes.map((node) => positions.has(node.id)
      ? { ...node, position: positions.get(node.id)! }
      : node),
    movableIds,
  )
}

function NoteHeadingPrompt({
  note,
  onClose,
  onAdd,
}: {
  note?: Note
  onClose: () => void
  onAdd: (heading: string) => void
}) {
  const [heading, setHeading] = useState('')
  return (
    <Dialog title="Add this note to the canvas" onClose={onClose}>
      <form className="form note-heading-form" onSubmit={(event) => {
        event.preventDefault()
        onAdd(heading)
      }}>
        <div>
          <p className="eyebrow">Optional key point</p>
          <p className="heading-prompt-copy">
            Give this card a short heading so its role is clear at a glance.
            You can always add or change it later.
          </p>
        </div>
        {note && <blockquote>{richTextPreview(note.content)}</blockquote>}
        <label>
          Key-point heading
          <input
            autoFocus
            value={heading}
            maxLength={160}
            onChange={(event) => setHeading(event.target.value)}
            placeholder="e.g. Supervised learning predicts labelled outcomes"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="button subtle" onClick={() => onAdd('')}>Skip</button>
          <button className="button primary">Add to canvas</button>
        </div>
      </form>
    </Dialog>
  )
}

function NoteInspector({
  item,
  note,
  book,
  user,
  onClose,
  onSaveItem,
  onSaveNote,
  onRemove,
}: {
  item: CanvasItem
  note: Note
  book: Book
  user: User | null
  onClose: () => void
  onSaveItem: (item: CanvasItem) => void
  onSaveNote: (note: Note) => void
  onRemove: () => void
}) {
  const [heading, setHeading] = useState(item.label)
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(note.content)
  const [pageStart, setPageStart] = useState(note.pageStart ?? 0)
  const [pageEnd, setPageEnd] = useState(note.pageEnd ?? 0)
  const [kind, setKind] = useState<Note['kind']>(note.kind)
  const [tags, setTags] = useState(note.tags.join(', '))
  const hasContent = Boolean(richTextPreview(content)) || /<img[\s>]/i.test(content)

  const saveHeading = () => {
    if (heading === item.label) return
    onSaveItem({
      ...item,
      label: heading.trim(),
      updatedAt: new Date().toISOString(),
    })
  }

  const toggleCompact = () => {
    onSaveItem({
      ...item,
      compact: !item.compact,
      height: item.compact ? Math.max(item.height, 170) : 116,
      updatedAt: new Date().toISOString(),
    })
  }

  const saveEditedNote = () => {
    const timestamp = new Date().toISOString()
    onSaveNote({
      ...note,
      content: content.trim(),
      pageStart,
      pageEnd,
      kind,
      tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
      updatedAt: timestamp,
    })
    setEditing(false)
  }

  return (
    <aside className="canvas-inspector" aria-label="Note inspector">
      <header>
        <div>
          <p className="eyebrow">Canvas note</p>
          <h2>{book.title}</h2>
          <p>{book.author} · {pageText(note)}</p>
        </div>
        <button className="icon-button" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="inspector-scroll">
        <label className="inspector-heading">
          Key-point heading
          <input
            value={heading}
            maxLength={160}
            onChange={(event) => setHeading(event.target.value)}
            onBlur={saveHeading}
            placeholder="Add the key point for this canvas…"
          />
        </label>
        <div className="inspector-actions">
          <button className="button subtle compact" onClick={toggleCompact}>
            {item.compact ? <Eye size={15} /> : <EyeOff size={15} />}
            {item.compact ? 'Expand card' : 'Compact card'}
          </button>
          <button className="button subtle compact" onClick={() => setEditing(!editing)}>
            <Pencil size={15} /> {editing ? 'Stop editing' : 'Edit original note'}
          </button>
        </div>
        {editing ? (
          <div className="inspector-editor">
            <div className="form-row">
              <label>From page<input type="number" min="0" value={pageStart} onChange={(event) => setPageStart(Number(event.target.value))} /></label>
              <label>To page<input type="number" min="0" value={pageEnd} onChange={(event) => setPageEnd(Number(event.target.value))} /></label>
              <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as Note['kind'])}><option value="note">Note</option><option value="quote">Quote</option><option value="question">Question</option></select></label>
            </div>
            <RichTextEditor value={content} onChange={setContent} user={user} bookId={book.id} />
            <label className="inspector-tags">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
            <button className="button primary inspector-save" disabled={!hasContent} onClick={saveEditedNote}>
              Save note changes
            </button>
          </div>
        ) : (
          <>
            <div className="inspector-note-meta">
              <span>{note.kind}</span>
              {note.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
            <RichContent content={note.content} />
          </>
        )}
      </div>
      <footer>
        <button className="text-button danger" onClick={onRemove}><Trash2 size={15} /> Remove from canvas</button>
      </footer>
    </aside>
  )
}

function ConnectionEditor({
  link,
  onClose,
  onSave,
  onDelete,
}: {
  link: CanvasLink
  onClose: () => void
  onSave: (link: CanvasLink) => void
  onDelete: () => void
}) {
  const [type, setType] = useState<CanvasLinkType>(link.type)
  const [label, setLabel] = useState(link.label)
  return (
    <aside className="connection-inspector" aria-label="Connection editor">
      <header>
        <div><p className="eyebrow">Connection</p><h2>Edit relationship</h2></div>
        <button className="icon-button" onClick={onClose}><X size={17} /></button>
      </header>
      <label>Relationship
        <select value={type} onChange={(event) => {
          const nextType = event.target.value as CanvasLinkType
          setType(nextType)
          if (label === link.label || label === linkLabels[type]) setLabel(linkLabels[nextType])
        }}>
          {Object.entries(linkLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      <label>Connection label
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Add a short explanation…" />
      </label>
      <button className="button subtle" onClick={() => onSave({
        ...link,
        sourceItemId: link.targetItemId,
        targetItemId: link.sourceItemId,
        type,
        label: label.trim() || linkLabels[type],
      })}>Reverse direction</button>
      <div className="connection-editor-actions">
        <button className="text-button danger" onClick={onDelete}><XCircle size={15} /> Delete</button>
        <button className="button primary" onClick={() => onSave({
          ...link,
          type,
          label: label.trim() || linkLabels[type],
        })}>Save connection</button>
      </div>
    </aside>
  )
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
