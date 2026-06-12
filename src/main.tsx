import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { AppErrorBoundary } from './components/AppErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </HashRouter>
  </StrictMode>,
)
