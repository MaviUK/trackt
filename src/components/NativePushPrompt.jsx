import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import './NativePushPrompt.css'

const DISMISSED_KEY = 'burgrs_push_prompt_dismissed'
const TOKEN_KEY = 'burgrs_push_device_token'

export default function NativePushPrompt() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (window.localStorage.getItem(DISMISSED_KEY) === '1') return

    let cancelled = false

    async function checkPermission() {
      try {
        const status = await PushNotifications.checkPermissions()
        if (!cancelled && status.receive !== 'granted') setVisible(true)
      } catch (error) {
        console.error('Unable to check notification permission:', error)
      }
    }

    checkPermission()
    return () => {
      cancelled = true
    }
  }, [])

  async function enableNotifications() {
    if (busy) return
    setBusy(true)
    setMessage('')

    const registrationListener = await PushNotifications.addListener('registration', (token) => {
      window.localStorage.setItem(TOKEN_KEY, token.value)
      window.dispatchEvent(new CustomEvent('burgrs:push-token', { detail: token.value }))
      setMessage('Notifications are ready on this phone.')
      window.setTimeout(() => setVisible(false), 900)
    })

    const errorListener = await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration failed:', error)
      setMessage('This phone could not be registered. Please try again.')
      setBusy(false)
    })

    try {
      let status = await PushNotifications.checkPermissions()
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        status = await PushNotifications.requestPermissions()
      }

      if (status.receive !== 'granted') {
        setMessage('Notifications were not enabled. You can allow them later in phone settings.')
        setBusy(false)
        return
      }

      await PushNotifications.register()
    } catch (error) {
      console.error('Unable to enable notifications:', error)
      setMessage('Notifications could not be enabled. Please try again.')
      setBusy(false)
    }

    window.setTimeout(() => {
      registrationListener.remove()
      errorListener.remove()
    }, 15000)
  }

  function dismissPrompt() {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="native-push-prompt-backdrop" role="presentation">
      <section className="native-push-prompt" role="dialog" aria-modal="true" aria-labelledby="native-push-title">
        <div className="native-push-icon" aria-hidden="true">🔔</div>
        <h2 id="native-push-title">Never miss what’s next</h2>
        <p>Get phone alerts for new episodes, replies and important BURGRS activity.</p>
        {message ? <div className="native-push-message" role="status">{message}</div> : null}
        <button className="native-push-enable" type="button" onClick={enableNotifications} disabled={busy}>
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
        <button className="native-push-later" type="button" onClick={dismissPrompt} disabled={busy}>
          Not now
        </button>
      </section>
    </div>
  )
}
