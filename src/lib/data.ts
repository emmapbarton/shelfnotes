import type { User } from '@supabase/supabase-js'
import type {
  Book,
  BookStatus,
  Canvas,
  CanvasItem,
  CanvasLink,
  LegacyLibrary,
  LegacyNote,
  LibraryData,
  Note,
} from '../types'
import { supabase } from './supabase'

const STORAGE_KEY = 'shelf-notes-library-v1'
const LEGACY_KEY = 'pll_data'

const now = () => new Date().toISOString()
export const uid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

const legacyNoteContent = (note: LegacyNote) => {
  const sections = [
    note.ideas && `<h4>Key ideas</h4>${note.ideas}`,
    note.questions && `<h4>Questions</h4>${note.questions}`,
    note.actions && `<h4>Actions</h4>${note.actions}`,
  ].filter(Boolean)
  return sections.join('')
}

const parsePages = (value = '') => {
  const pages = value.match(/\d+/g)?.map(Number) ?? []
  return {
    pageStart: pages[0] ?? null,
    pageEnd: pages[1] ?? pages[0] ?? null,
  }
}

const normalizeStatus = (status = ''): BookStatus => {
  const value = status.toLowerCase().replace(/\s+/g, '_')
  if (value === 'reading' || value === 'paused' || value === 'finished') {
    return value
  }
  return 'not_started'
}

export function migrateLegacy(data: LegacyLibrary): LibraryData {
  const books: Book[] = []
  const notes: Note[] = []

  for (const oldBook of data.books ?? []) {
    const bookId = uid()
    const createdAt = now()
    books.push({
      id: bookId,
      title: oldBook.title?.trim() || 'Untitled book',
      author: oldBook.author?.trim() || '',
      category: oldBook.category?.trim() || 'Uncategorised',
      coverUrl: oldBook.coverUrl?.trim() || '',
      totalPages: Number(oldBook.totalPages) || 0,
      currentPage: Number(oldBook.currentPage) || 0,
      status: normalizeStatus(oldBook.status),
      createdAt,
      updatedAt: createdAt,
    })

    for (const oldNote of oldBook.notes ?? []) {
      const pages = parsePages(oldNote.pages)
      const date = oldNote.date
        ? new Date(`${oldNote.date}T12:00:00`).toISOString()
        : createdAt
      notes.push({
        id: uid(),
        bookId,
        ...pages,
        content: legacyNoteContent(oldNote),
        kind: 'note',
        tags: oldNote.tags ?? [],
        createdAt: date,
        updatedAt: date,
      })
    }
  }

  return { books, notes, canvases: [], canvasItems: [], canvasLinks: [] }
}

function seedLibrary(): LibraryData {
  const bookId = uid()
  const createdAt = now()
  return {
    books: [
      {
        id: bookId,
        title: 'A Room of One’s Own',
        author: 'Virginia Woolf',
        category: 'Essays',
        coverUrl: '',
        totalPages: 112,
        currentPage: 28,
        status: 'reading',
        createdAt,
        updatedAt: createdAt,
      },
    ],
    notes: [
      {
        id: uid(),
        bookId,
        pageStart: 24,
        pageEnd: 28,
        content:
          'A room is both literal space and a way of naming the freedom to think without interruption.',
        kind: 'note',
        tags: ['space', 'freedom', 'writing'],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    canvases: [],
    canvasItems: [],
    canvasLinks: [],
  }
}

export function loadLocalLibrary(): LibraryData {
  let current: string | null = null
  try {
    current = localStorage.getItem(STORAGE_KEY)
  } catch {
    return seedLibrary()
  }
  if (current) {
    let parsed: Partial<LibraryData>
    try {
      parsed = JSON.parse(current) as Partial<LibraryData>
    } catch {
      return seedLibrary()
    }
    const library: LibraryData = {
      books: parsed.books ?? [],
      notes: parsed.notes ?? [],
      canvases: parsed.canvases ?? [],
      canvasItems: parsed.canvasItems ?? [],
      canvasLinks: parsed.canvasLinks ?? [],
    }
    const restored = restoreLegacyFormatting(library)
    const normalized = normalizeIdentifiers(restored)
    if (normalized !== library) saveLocalLibrary(normalized)
    return normalized
  }

  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_KEY)
  } catch {
    return seedLibrary()
  }
  const data = legacy
    ? migrateLegacy(JSON.parse(legacy) as LegacyLibrary)
    : seedLibrary()
  saveLocalLibrary(data)
  return data
}

function restoreLegacyFormatting(library: LibraryData) {
  let legacyValue: string | null = null
  try {
    legacyValue = localStorage.getItem(LEGACY_KEY)
  } catch {
    return library
  }
  if (!legacyValue) return library
  const legacySource = JSON.parse(legacyValue) as LegacyLibrary
  let changed = false
  const notes = library.notes.map((note) => {
    if (/<[a-z][\s\S]*>/i.test(note.content)) return note
    const sourceNote = legacySource.books
      ?.flatMap((book) => book.notes ?? [])
      .find((candidate) => candidate.id === note.id)
    if (!sourceNote) return note
    changed = true
    return { ...note, content: legacyNoteContent(sourceNote) }
  })
  return changed ? { ...library, notes } : library
}

function normalizeIdentifiers(library: LibraryData) {
  const bookIds = new Map<string, string>()
  const noteIds = new Map<string, string>()
  library.books.forEach((book) => {
    if (!isUuid(book.id)) bookIds.set(book.id, uid())
  })
  library.notes.forEach((note) => {
    if (!isUuid(note.id)) noteIds.set(note.id, uid())
  })
  if (!bookIds.size && !noteIds.size) return library
  return {
    ...library,
    books: library.books.map((book) => ({
      ...book,
      id: bookIds.get(book.id) ?? book.id,
    })),
    notes: library.notes.map((note) => ({
      ...note,
      id: noteIds.get(note.id) ?? note.id,
      bookId: bookIds.get(note.bookId) ?? note.bookId,
    })),
    canvases: library.canvases.map((canvas) => ({
      ...canvas,
      bookIds: canvas.bookIds.map((id) => bookIds.get(id) ?? id),
    })),
    canvasItems: library.canvasItems.map((item) => ({
      ...item,
      noteId: item.noteId ? noteIds.get(item.noteId) ?? item.noteId : null,
    })),
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function saveLocalLibrary(data: LibraryData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // The app remains usable in memory when storage is blocked or full.
  }
}

export async function loadCloudLibrary(): Promise<LibraryData> {
  if (!supabase) return loadLocalLibrary()
  const local = loadLocalLibrary()
  const [
    { data: books, error: booksError },
    { data: notes, error: notesError },
    { data: canvases, error: canvasesError },
    { data: canvasItems, error: canvasItemsError },
    { data: canvasLinks, error: canvasLinksError },
  ] =
    await Promise.all([
      supabase.from('books').select('*').order('updated_at', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
      supabase.from('canvases').select('*').order('updated_at', { ascending: false }),
      supabase.from('canvas_items').select('*'),
      supabase.from('canvas_links').select('*'),
    ])

  if (booksError) throw booksError
  if (notesError) throw notesError

  return {
    books: (books ?? []).map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author ?? '',
      category: book.category ?? 'Uncategorised',
      coverUrl: book.cover_url ?? '',
      totalPages: book.total_pages ?? 0,
      currentPage: book.current_page ?? 0,
      status: book.status,
      createdAt: book.created_at,
      updatedAt: book.updated_at,
    })),
    notes: (notes ?? []).map((note) => ({
      id: note.id,
      bookId: note.book_id,
      pageStart: note.page_start,
      pageEnd: note.page_end,
      content: note.content,
      kind: note.kind,
      tags: note.tags ?? [],
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    })),
    canvases: canvasesError || !canvases?.length ? local.canvases : canvases.map((canvas) => ({
      id: canvas.id,
      title: canvas.title,
      question: canvas.question ?? '',
      bookIds: canvas.book_ids ?? [],
      createdAt: canvas.created_at,
      updatedAt: canvas.updated_at,
    })),
    canvasItems: canvasItemsError || !canvasItems?.length ? local.canvasItems : canvasItems.map((item) => ({
      id: item.id,
      canvasId: item.canvas_id,
      kind: item.kind,
      noteId: item.note_id,
      content: item.content ?? '',
      label: item.label ?? '',
      x: Number(item.x),
      y: Number(item.y),
      width: Number(item.width),
      height: Number(item.height),
      color: item.color ?? '',
      locked: item.locked ?? false,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    canvasLinks: canvasLinksError || !canvasLinks?.length ? local.canvasLinks : canvasLinks.map((link) => ({
      id: link.id,
      canvasId: link.canvas_id,
      sourceItemId: link.source_item_id,
      targetItemId: link.target_item_id,
      type: link.type,
      label: link.label ?? '',
      createdAt: link.created_at,
    })),
  }
}

export async function saveCanvas(user: User | null, canvas: Canvas) {
  if (!user || !supabase) return
  const { error } = await supabase.from('canvases').upsert({
    id: canvas.id, user_id: user.id, title: canvas.title,
    question: canvas.question, book_ids: canvas.bookIds,
    created_at: canvas.createdAt, updated_at: canvas.updatedAt,
  })
  if (error) throw error
}

export async function saveCanvasItem(user: User | null, item: CanvasItem) {
  if (!user || !supabase) return
  const record = {
    id: item.id, user_id: user.id, canvas_id: item.canvasId, kind: item.kind,
    note_id: item.noteId, content: item.content, label: item.label,
    x: item.x, y: item.y, width: item.width, height: item.height,
    color: item.color, created_at: item.createdAt, updated_at: item.updatedAt,
  }
  const { error } = await supabase.from('canvas_items').upsert({
    ...record,
    locked: item.locked ?? false,
  })
  if (error?.code === 'PGRST204' && error.message.includes('locked')) {
    const { error: compatibilityError } = await supabase.from('canvas_items').upsert(record)
    if (compatibilityError) throw compatibilityError
    return
  }
  if (error) throw error
}

export async function saveCanvasLink(user: User | null, link: CanvasLink) {
  if (!user || !supabase) return
  const { error } = await supabase.from('canvas_links').upsert({
    id: link.id, user_id: user.id, canvas_id: link.canvasId,
    source_item_id: link.sourceItemId, target_item_id: link.targetItemId,
    type: link.type, label: link.label, created_at: link.createdAt,
  })
  if (error) throw error
}

export async function deleteCanvasRecord(user: User | null, table: 'canvases' | 'canvas_items' | 'canvas_links', id: string) {
  if (!user || !supabase) return
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function saveBook(user: User | null, book: Book) {
  if (!user || !supabase) return
  const { error } = await supabase.from('books').upsert({
    id: book.id,
    user_id: user.id,
    title: book.title,
    author: book.author,
    category: book.category,
    cover_url: book.coverUrl || null,
    total_pages: book.totalPages,
    current_page: book.currentPage,
    status: book.status,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
  })
  if (error) throw error
}

export async function saveNote(user: User | null, note: Note) {
  if (!user || !supabase) return
  const { error } = await supabase.from('notes').upsert({
    id: note.id,
    user_id: user.id,
    book_id: note.bookId,
    page_start: note.pageStart,
    page_end: note.pageEnd,
    content: note.content,
    kind: note.kind,
    tags: note.tags,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  })
  if (error) throw error
}

export async function deleteCloudNote(user: User | null, noteId: string) {
  if (!user || !supabase) return
  const { error } = await supabase.from('notes').delete().eq('id', noteId)
  if (error) throw error
}

export async function migrateLocalToCloud(user: User, library: LibraryData) {
  if (!supabase) return
  for (const book of library.books) await saveBook(user, book)
  for (const note of library.notes) await saveNote(user, note)
  for (const canvas of library.canvases) await saveCanvas(user, canvas)
  for (const item of library.canvasItems) await saveCanvasItem(user, item)
  for (const link of library.canvasLinks) await saveCanvasLink(user, link)
}
