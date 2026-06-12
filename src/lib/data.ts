import type { User } from '@supabase/supabase-js'
import type {
  Book,
  BookStatus,
  LegacyLibrary,
  LibraryData,
  Note,
} from '../types'
import { supabase } from './supabase'

const STORAGE_KEY = 'shelf-notes-library-v1'
const LEGACY_KEY = 'pll_data'

const now = () => new Date().toISOString()
export const uid = () => crypto.randomUUID()

const cleanText = (html = '') => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.trim() ?? ''
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
    const bookId = oldBook.id || uid()
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
      const sections = [
        oldNote.ideas && cleanText(oldNote.ideas),
        oldNote.questions && `Questions\n${cleanText(oldNote.questions)}`,
        oldNote.actions && `Actions\n${cleanText(oldNote.actions)}`,
      ].filter(Boolean)
      const pages = parsePages(oldNote.pages)
      const date = oldNote.date
        ? new Date(`${oldNote.date}T12:00:00`).toISOString()
        : createdAt
      notes.push({
        id: oldNote.id || uid(),
        bookId,
        ...pages,
        content: sections.join('\n\n'),
        kind: 'note',
        tags: oldNote.tags ?? [],
        createdAt: date,
        updatedAt: date,
      })
    }
  }

  return { books, notes }
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
  }
}

export function loadLocalLibrary(): LibraryData {
  const current = localStorage.getItem(STORAGE_KEY)
  if (current) return JSON.parse(current) as LibraryData

  const legacy = localStorage.getItem(LEGACY_KEY)
  const data = legacy
    ? migrateLegacy(JSON.parse(legacy) as LegacyLibrary)
    : seedLibrary()
  saveLocalLibrary(data)
  return data
}

export function saveLocalLibrary(data: LibraryData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export async function loadCloudLibrary(): Promise<LibraryData> {
  if (!supabase) return loadLocalLibrary()
  const [{ data: books, error: booksError }, { data: notes, error: notesError }] =
    await Promise.all([
      supabase.from('books').select('*').order('updated_at', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
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
  }
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
}
