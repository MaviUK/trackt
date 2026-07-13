import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ProfileIssueReportMount from './components/ProfileIssueReportMount'
import { installNativeApiBridge } from './lib/installNativeApiBridge'
import { installMobileOverscrollGuard } from './lib/installMobileOverscrollGuard'
import { installUserCacheIsolation } from './lib/installUserCacheIsolation'
import './index.css'
import './rankd-button-fixes.css'
import './mobile-header-consistency.css'
import './rankd-social-share.css'
import './activity-share-buttons.css'
import './rankd-guest-share-vote.css'
import './public-shared-content.css'
import './show-data-refresh-button.css'
import './remove-show-data-refresh-button.css'
import './dashboard-premiering-soon.css'
import './dashboard-loading-screen.css'
import './firefox-mobile-nav-fix.css'
import './notification-alerts.css'
import './public-show-watch-providers.css'
import './creator-profile-chats.css'
import './creator-list-comments.css'
import './following-list-card-consistency.css'
import './creator-generated-banner.css'
import './profile-edit-bottom-spacing.css'
import './creator-profile-header-layout.css'
import './header-profile-username-fix.css'
import './creator-profile-loading.css'
import './app-startup-loading.css'
import './creator-bio-limit.css'
import './creator-rankd-list-button.css'
import './components/ReviewThreadExtras.css'
import './rankd-scroll-fix.js'
import './rankd-social-share.js'
import './dashboard-airing-link-fix.js'
import './activity-share-buttons.js'
import './rankd-guest-share-vote.js'
import './rankd-shared-stats-fix.js'
import './public-shared-content.js'
import './show-data-refresh-button.js'
import './dashboard-premiering-soon.js'
import './dashboard-loading-screen.js'
import './notification-nav-badge.js'
import './notification-deep-links.js'
import './notification-copy-cleanup.js'
import './public-show-watch-providers.js'
import './creator-profile-chats.js'
import './creator-list-comments.js'
import './following-list-card-consistency.js'
import './creator-generated-banner.js'
import './creator-profile-header-layout.js'
import './creator-bio-limit.js'
import './creator-rankd-list-button.js'

installNativeApiBridge()
installMobileOverscrollGuard()
installUserCacheIsolation()

function BootReady() {
  React.useEffect(() => {
    const loader = document.getElementById('boot-loader')
    if (!loader) return

    loader.style.opacity = '0'
    loader.style.pointerEvents = 'none'
    loader.style.transition = 'opacity 160ms ease'

    const timer = window.setTimeout(() => loader.remove(), 180)
    return () => window.clearTimeout(timer)
  }, [])

  return null
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('BURGRS render failed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-startup-loading" role="alert">
          <div className="app-startup-loading-card">
            <div className="app-startup-loading-burger" aria-hidden="true">🍔</div>
            <strong>BURGRS could not load</strong>
            <span>Please reload and try again.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                minHeight: 44,
                border: 0,
                borderRadius: 999,
                background: '#f8fafc',
                color: '#111827',
                fontWeight: 900,
              }}
            >
              Reload
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BootReady />
    <AppErrorBoundary>
      <App />
      <ProfileIssueReportMount />
    </AppErrorBoundary>
  </React.StrictMode>,
)
