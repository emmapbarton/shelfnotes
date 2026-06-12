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
    notes?: Array<{
      id?: string
      date?: string
      pages?: string
      ideas?: string
      questions?: string
      actions?: string
      tags?: string[]
    }>
  }>
}
