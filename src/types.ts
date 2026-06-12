export type BookStatus = 'not_started' | 'reading' | 'paused' | 'finished'

export interface Note {
  id: string
  bookId: string
  pageStart: number | null
  pageEnd: number | null
  content: string
  kind: 'note' | 'quote' | 'question'
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Book {
  id: string
  title: string
  author: string
  category: string
  coverUrl: string
  totalPages: number
  currentPage: number
  status: BookStatus
  createdAt: string
  updatedAt: string
}

export interface LibraryData {
  books: Book[]
  notes: Note[]
  canvases: Canvas[]
  canvasItems: CanvasItem[]
  canvasLinks: CanvasLink[]
}

export interface Canvas {
  id: string
  title: string
  question: string
  bookIds: string[]
  createdAt: string
  updatedAt: string
}

export type CanvasItemKind = 'note' | 'text' | 'group'

export interface CanvasItem {
  id: string
  canvasId: string
  kind: CanvasItemKind
  noteId: string | null
  content: string
  label: string
  x: number
  y: number
  width: number
  height: number
  color: string
  createdAt: string
  updatedAt: string
}

export type CanvasLinkType =
  | 'related'
  | 'supports'
  | 'contradicts'
  | 'extends'
  | 'answers'

export interface CanvasLink {
  id: string
  canvasId: string
  sourceItemId: string
  targetItemId: string
  type: CanvasLinkType
  label: string
  createdAt: string
}

export interface LegacyLibrary {
  books?: Array<{
    id?: string
    title?: string
    author?: string
    category?: string
    coverUrl?: string
    totalPages?: number
    currentPage?: number
    status?: string
    notes?: LegacyNote[]
  }>
}

export interface LegacyNote {
  id?: string
  date?: string
  pages?: string
  ideas?: string
  questions?: string
  actions?: string
  tags?: string[]
}
