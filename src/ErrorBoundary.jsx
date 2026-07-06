import { Component } from 'react'
import { STORAGE_KEY } from './config'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  handleClearAndReload = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    try {
      indexedDB.deleteDatabase('verify-app-db')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 }}>
              {this.state.error.message || 'An unexpected error occurred while rendering the app.'}
              {' '}Your uploaded data is saved locally and a reload usually fixes this.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={this.handleReload} style={{ fontSize: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#111827', color: 'white', cursor: 'pointer' }}>
                Reload
              </button>
              <button onClick={this.handleClearAndReload} style={{ fontSize: 14, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'transparent', cursor: 'pointer' }}>
                Clear saved data &amp; reload
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
