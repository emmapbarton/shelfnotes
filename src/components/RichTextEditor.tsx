import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Bold,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  refreshPrivateImages,
  sanitiseRichText,
} from '../lib/richText'

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function RichContent({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const safeHtml = sanitiseRichText(content)

  useEffect(() => {
    async function refreshImages() {
      if (!containerRef.current) return
      await refreshPrivateImages(containerRef.current)
    }
    void refreshImages()
  }, [content])

  return (
    <div
      ref={containerRef}
      className="rich-content"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}

export function RichTextEditor({
  value,
  onChange,
  user,
  bookId,
}: {
  value: string
  onChange: (value: string) => void
  user: User | null
  bookId: string
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const initialisedRef = useRef(false)
  const selectionRef = useRef<Range | null>(null)
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(
    null,
  )
  const [imageWidth, setImageWidth] = useState(60)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!editorRef.current || initialisedRef.current) return
    editorRef.current.innerHTML = sanitiseRichText(value)
    initialisedRef.current = true
    void refreshPrivateImages(editorRef.current)
  }, [value])

  const rememberSelection = () => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange()
    }
  }

  const restoreSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selectionRef.current) return
    selection.removeAllRanges()
    selection.addRange(selectionRef.current)
  }

  const collapseSelectionToEnd = () => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return
    selection.collapseToEnd()
  }

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus({ preventScroll: true })
    restoreSelection()
    document.execCommand(command, false, commandValue)
    collapseSelectionToEnd()
    rememberSelection()
    emitChange()
  }

  const emitChange = () => {
    rememberSelection()
    onChange(editorRef.current?.innerHTML ?? '')
  }

  const insertImage = async (file: File) => {
    if (!imageTypes.includes(file.type)) return
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Images must be smaller than 8 MB.')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      let src = ''
      let storagePath = ''
      if (user && supabase) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        storagePath = `${user.id}/${bookId}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage
          .from('note-attachments')
          .upload(storagePath, file, { contentType: file.type })
        if (error) throw error
        const { data, error: signedUrlError } = await supabase.storage
          .from('note-attachments')
          .createSignedUrl(storagePath, 60 * 60)
        if (signedUrlError) throw signedUrlError
        src = data.signedUrl
      } else {
        src = await readAsDataUrl(file)
      }

      const image = document.createElement('img')
      image.src = src
      image.alt = 'Note attachment'
      image.style.width = '60%'
      image.style.height = 'auto'
      if (storagePath) image.dataset.storagePath = storagePath
      editorRef.current?.append(image, document.createElement('p'))
      setSelectedImage(image)
      setImageWidth(60)
      emitChange()
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Could not add that image.',
      )
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void insertImage(file)
  }

  const resizeImage = (width: number) => {
    setImageWidth(width)
    if (!selectedImage) return
    selectedImage.style.width = `${width}%`
    selectedImage.style.height = 'auto'
    emitChange()
  }

  return (
    <div className="rich-editor-shell">
      <div className="rich-toolbar" aria-label="Note formatting">
        <ToolbarButton label="Bold" onRun={() => runCommand('bold')}>
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton label="Italic" onRun={() => runCommand('italic')}>
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton label="Underline" onRun={() => runCommand('underline')}>
          <Underline size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Highlight"
          onRun={() => runCommand('hiliteColor', '#f3d77a')}
        >
          <Highlighter size={16} />
        </ToolbarButton>
        <span className="toolbar-divider" />
        <ToolbarButton
          label="Bulleted list"
          onRun={() => runCommand('insertUnorderedList')}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onRun={() => runCommand('insertOrderedList')}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <span className="toolbar-divider" />
        <ToolbarButton label="Add image" onRun={() => fileRef.current?.click()}>
          <ImagePlus size={16} />
        </ToolbarButton>
        {uploading && <span className="upload-status">Uploading…</span>}
        <input
          ref={fileRef}
          hidden
          type="file"
          accept={imageTypes.join(',')}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-editor"
        contentEditable
        role="textbox"
        aria-label="Your thought"
        aria-multiline="true"
        suppressContentEditableWarning
        data-placeholder="What made you pause?"
        onInput={emitChange}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onClick={(event) => {
          rememberSelection()
          const target = event.target
          if (target instanceof HTMLImageElement) {
            setSelectedImage(target)
            setImageWidth(parseFloat(target.style.width) || 60)
          } else {
            setSelectedImage(null)
          }
        }}
        onPaste={(event) => {
          const image = Array.from(event.clipboardData.items).find((item) =>
            item.type.startsWith('image/'),
          )
          if (!image) return
          event.preventDefault()
          const file = image.getAsFile()
          if (file) void insertImage(file)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          handleFiles(event.dataTransfer.files)
        }}
      />
      {selectedImage && (
        <div className="image-resizer">
          <span>Image size</span>
          <input
            aria-label="Image width"
            type="range"
            min="20"
            max="100"
            value={imageWidth}
            onChange={(event) => resizeImage(Number(event.target.value))}
          />
          <output>{Math.round(imageWidth)}%</output>
          <button
            type="button"
            onClick={() => {
              selectedImage.remove()
              setSelectedImage(null)
              emitChange()
            }}
          >
            Remove image
          </button>
        </div>
      )}
      <p className="editor-help">
        Paste or drop an image here. Select an image to resize it.
      </p>
      {uploadError && <p className="editor-error">{uploadError}</p>}
    </div>
  )
}

function ToolbarButton({
  label,
  onRun,
  children,
}: {
  label: string
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault()
        onRun()
      }}
    >
      {children}
    </button>
  )
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
