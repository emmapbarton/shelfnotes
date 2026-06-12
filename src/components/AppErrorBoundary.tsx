import { Component, type ErrorInfo, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Shelf Notes failed to start', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="startup-error">
        <div>
          <p className="eyebrow">Shelf Notes could not open</p>
          <h1>Let’s clear the page and try again.</h1>
          <p>
            Your notes have not been deleted. This is usually caused by an old
            cached app file or blocked browser storage.
          </p>
          <button
            className="button primary"
            onClick={() => {
              if ('caches' in window) {
                void caches.keys().then((keys) =>
                  Promise.all(keys.map((key) => caches.delete(key))),
                )
              }
              window.location.reload()
            }}
          >
            Reload Shelf Notes
          </button>
          <details>
            <summary>Technical detail</summary>
            <code>{this.state.error.message}</code>
          </details>
        </div>
      </main>
    )
  }
}
