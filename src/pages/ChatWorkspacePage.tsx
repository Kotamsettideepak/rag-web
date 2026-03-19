import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { Composer } from '../components/ui/Composer'
import { MessageList } from '../components/ui/MessageList'
import { askQuestion, uploadFiles } from '../requests/chat'
import type { ChatMessage, UploadedAsset } from '../types/chat'
import { acceptedFileTypes, buildPreviewUrl, inferAttachmentKind, revokePreviewUrl } from '../utils/files'

const AUTO_SUBMIT_DELAY_MS = 3000

interface ChatThread {
  id: string
  title: string
  messages: ChatMessage[]
  uploads: UploadedAsset[]
}

function createMessage(role: ChatMessage['role'], content: string, sources?: string[]): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    sources,
    state: 'complete',
  }
}

function createAsset(file: File): UploadedAsset {
  const kind = inferAttachmentKind(file)

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    mimeType: file.type,
    kind,
    previewUrl: buildPreviewUrl(file, kind),
    status: 'uploading',
  }
}

function createThread(label = 'New chat'): ChatThread {
  return {
    id: crypto.randomUUID(),
    title: label,
    messages: [],
    uploads: [],
  }
}

function buildThreadTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  return firstUserMessage?.content.slice(0, 28) || 'New chat'
}

export const ChatWorkspacePage = memo(function ChatWorkspacePage() {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef('')
  const threadsRef = useRef<ChatThread[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const shouldAutoSubmitRef = useRef(false)
  const micBaseTextRef = useRef('')

  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition
  const micSupported = Boolean(SpeechRecognitionApi)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    threadsRef.current = threads
  }, [threads])

  const activeThread = threads.find((thread) => thread.id === activeThreadId)
  const messages = activeThread?.messages ?? []
  const uploads = activeThread?.uploads ?? []
  const hasUploads = uploads.length > 0
  const hasActiveThread = Boolean(activeThreadId)

  useEffect(() => {
    const conversation = conversationRef.current

    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight
    }
  }, [messages, activeThreadId])

  useEffect(() => {
    return () => {
      threadsRef.current.forEach((thread) => {
        thread.uploads.forEach((upload) => revokePreviewUrl(upload.previewUrl))
      })

      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current)
      }

      recognitionRef.current?.stop()
    }
  }, [])

  function updateActiveThread(updater: (thread: ChatThread) => ChatThread) {
    setThreads((current) =>
      current.map((thread) => (thread.id === activeThreadId ? updater(thread) : thread)),
    )
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function resetSilenceTimer() {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
    }

    silenceTimerRef.current = window.setTimeout(() => {
      shouldAutoSubmitRef.current = true
      recognitionRef.current?.stop()
    }, AUTO_SUBMIT_DELAY_MS)
  }

  function stopListening() {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    recognitionRef.current?.stop()
    setIsListening(false)
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return
    }

    const files = Array.from(fileList)
    const nextAssets = files.map(createAsset)

    let currentThreadId = activeThreadId
    if (!currentThreadId) {
      const newThread = createThread()
      setThreads((current) => [newThread, ...current])
      setActiveThreadId(newThread.id)
      currentThreadId = newThread.id
    }

    setThreads((current) =>
      current.map((thread) =>
        thread.id === currentThreadId
          ? { ...thread, uploads: [...thread.uploads, ...nextAssets] }
          : thread,
      ),
    )

    try {
      const responses = await uploadFiles(files)

      setThreads((current) =>
        current.map((thread) =>
          thread.id === currentThreadId
            ? {
                ...thread,
                uploads: thread.uploads.map((asset) => {
                  const matchedIndex = nextAssets.findIndex((nextAsset) => nextAsset.id === asset.id)

                  if (matchedIndex === -1) {
                    return asset
                  }

                  const response = responses[matchedIndex]

                  return {
                    ...asset,
                    id: response.fileId,
                    status: response.status === 'ready' ? 'ready' : 'uploading',
                  }
                }),
              }
            : thread,
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed. Please try again.'

      setThreads((current) =>
        current.map((thread) =>
          thread.id === currentThreadId
            ? {
                ...thread,
                uploads: thread.uploads.map((asset) =>
                  nextAssets.some((nextAsset) => nextAsset.id === asset.id)
                    ? { ...asset, status: 'failed' }
                    : asset,
                ),
                messages: [...thread.messages, createMessage('assistant', `Upload issue: ${message}`)],
              }
            : thread,
        ),
      )
    }
  }

  async function handleSubmit(overridePrompt?: string) {
    const prompt = (overridePrompt ?? draftRef.current).trim()

    if (!prompt || !hasUploads || !activeThreadId) {
      return
    }

    const userMessage = createMessage('user', prompt)
    setDraft('')
    draftRef.current = ''
    setIsSending(true)

    updateActiveThread((thread) => {
      const nextMessages = [...thread.messages, userMessage]

      return {
        ...thread,
        title: buildThreadTitle(nextMessages),
        messages: nextMessages,
      }
    })

    try {
      const response = await askQuestion({
        prompt,
        activeFileIds: uploads.filter((upload) => upload.status === 'ready').map((upload) => upload.id),
      })

      updateActiveThread((thread) => {
        const nextMessages = [...thread.messages, createMessage('assistant', response.answer, response.sources)]

        return {
          ...thread,
          title: buildThreadTitle(nextMessages),
          messages: nextMessages,
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed. Please try again.'

      updateActiveThread((thread) => ({
        ...thread,
        messages: [...thread.messages, createMessage('assistant', `The request failed: ${message}`)],
      }))
    } finally {
      setIsSending(false)
    }
  }

  function startListening() {
    if (!SpeechRecognitionApi) {
      return
    }

    recognitionRef.current?.stop()

    const recognition = new SpeechRecognitionApi()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    micBaseTextRef.current = draftRef.current.trim()
    shouldAutoSubmitRef.current = false

    recognition.onstart = () => {
      setIsListening(true)
      resetSilenceTimer()
    }

    recognition.onresult = (event) => {
      let transcript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript
      }

      const currentBase = micBaseTextRef.current
      const nextDraft = [currentBase, transcript.trim()].filter(Boolean).join(' ').trim()
      setDraft(nextDraft)
      draftRef.current = nextDraft
      resetSilenceTimer()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      console.error('Speech recognition error:', event.error, event.message)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)

      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      if (shouldAutoSubmitRef.current) {
        shouldAutoSubmitRef.current = false
        void handleSubmit(draftRef.current)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function toggleMic() {
    if (isListening) {
      shouldAutoSubmitRef.current = false
      stopListening()
      return
    }

    startListening()
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFilesSelected(event.target.files)
    event.target.value = ''
  }

  function handleRemoveUpload(id: string) {
    const found = uploads.find((asset) => asset.id === id)

    if (found?.previewUrl) {
      revokePreviewUrl(found.previewUrl)
    }

    updateActiveThread((thread) => ({
      ...thread,
      uploads: thread.uploads.filter((asset) => asset.id !== id),
    }))
  }

  function handleNewChat() {
    stopListening()
    // Remove any threads that have no messages (e.g. upload-only threads that were never chatted in)
    setThreads((current) => current.filter((thread) => thread.messages.length > 0))
    setActiveThreadId('')
    setDraft('')
    draftRef.current = ''
  }

  function handleSelectThread(threadId: string) {
    stopListening()
    setActiveThreadId(threadId)
    setDraft('')
    draftRef.current = ''
  }

  return (
    <div className="layout-shell">
      <aside className="sidebar-simple">
        <div className="sidebar-brand">
          <h1>Rag-AI</h1>
          <p>Your chat history</p>
        </div>

        <button type="button" className="primary-button sidebar-new-chat" onClick={handleNewChat}>
          New chat
        </button>

        <div className="sidebar-history">
          {threads.filter((thread) => thread.messages.length > 0).map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`history-item ${thread.id === activeThreadId ? 'active' : ''}`}
              onClick={() => handleSelectThread(thread.id)}
            >
              {thread.title}
            </button>
          ))}
        </div>
      </aside>

      <div className="simple-page">
        <header className="simple-header">
          <div>
            <h2>Rag-AI</h2>
            <p>Upload when you want, then ask with text or mic.</p>
          </div>
        </header>

        <main className="simple-main">
          {!hasActiveThread ? (
            /* ── PRE-CHAT: Upload zone only ── */
            <section className="upload-zone">
              <div className="upload-zone-content">
                <h3>Start a new chat by uploading files</h3>
                <p>Add a PDF, image, video, or audio file to begin.</p>
                <button type="button" className="primary-button" onClick={openFilePicker}>
                  Upload Files
                </button>
              </div>
            </section>
          ) : (
            /* ── CHAT VIEW: Pinned uploads + conversation + composer ── */
            <>
              <section className="upload-list-simple pinned-uploads-banner">
                {uploads.map((upload) => (
                  <div key={upload.id} className="upload-pill">
                    <span>{upload.name}</span>
                    <button type="button" onClick={() => handleRemoveUpload(upload.id)}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="add-more-files-button" onClick={openFilePicker}>
                  + Add file
                </button>
              </section>

              <section className="conversation simple-conversation" ref={conversationRef}>
                <MessageList messages={messages} hasUploads={hasUploads} />
              </section>

              <Composer
                value={draft}
                isSending={isSending}
                isListening={isListening}
                isDisabled={!hasUploads}
                micSupported={micSupported}
                onChange={setDraft}
                onSubmit={() => void handleSubmit()}
                onOpenPicker={openFilePicker}
                onMicToggle={toggleMic}
              />
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden-input"
            accept={acceptedFileTypes}
            multiple
            onChange={handleInputChange}
          />
        </main>
      </div>
    </div>
  )
})
