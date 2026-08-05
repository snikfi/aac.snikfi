import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import EnterpriseApp from './enterprise/EnterpriseApp.jsx'

const isEnterpriseRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/enterprise')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isEnterpriseRoute ? <EnterpriseApp /> : <App />}
  </StrictMode>,
)
