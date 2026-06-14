import DOMPurify from 'dompurify'
import { supabase } from './supabase'

export function normaliseRichText(content: string) {
  if (/<[a-z][\s\S]*>/i.test(content)) return content
  return content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function richTextPreview(content: string) {
  const doc = new DOMParser().parseFromString(content, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function sanitiseRichText(content: string) {
  const safeHtml = DOMPurify.sanitize(normaliseRichText(content), {
    ADD_ATTR: ['data-storage-path', 'style'],
  })
  const doc = new DOMParser().parseFromString(safeHtml, 'text/html')
  doc.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const width = element.style.width
    const background = element.style.backgroundColor
    element.removeAttribute('style')
    if (
      element instanceof HTMLImageElement &&
      /^\d+(?:\.\d+)?%$/.test(width)
    ) {
      element.style.width = width
      element.style.height = 'auto'
    }
    if (
      (element.tagName === 'SPAN' || element.tagName === 'MARK') &&
      isHighlightColor(background)
    ) {
      element.style.backgroundColor = '#f3d77a'
    }
  })
  return doc.body.innerHTML
}

export async function refreshPrivateImages(root: ParentNode) {
  const client = supabase
  if (!client) return
  const images = Array.from(
    root.querySelectorAll<HTMLImageElement>('img[data-storage-path]'),
  )
  await Promise.all(
    images.map(async (image) => {
      const path = image.dataset.storagePath
      if (!path) return
      const { data } = await client.storage
        .from('note-attachments')
        .createSignedUrl(path, 60 * 60)
      if (data?.signedUrl) image.src = data.signedUrl
    }),
  )
}

function isHighlightColor(value: string) {
  return [
    '#f3d77a',
    'rgb(243, 215, 122)',
    'rgba(243, 215, 122, 1)',
  ].includes(value.toLowerCase())
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
