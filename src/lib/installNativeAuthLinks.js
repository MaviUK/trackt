import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeApp = registerPlugin('App')
const ALLOWED_HOSTS = new Set(['burgrs.co.uk', 'www.burgrs.co.uk'])

let installed = false
let listenerHandle = null
let lastHandledUrl = ''

function getLoginTarget(rawUrl) {
  if (!rawUrl || typeof window === 'undefined') return null

  try {
    const url = new URL(rawUrl)
    const protocolAllowed = url.protocol === 'https:' || url.protocol === 'http:'
    const hostAllowed = ALLOWED_HOSTS.has(url.hostname.toLowerCase())
    const loginPath = url.pathname === '/login' || url.pathname.startsWith('/login/')

    if (!protocolAllowed || !hostAllowed || !loginPath) return null

    return `${url.pathname}${url.search}${url.hash}`
  } catch (error) {
    console.warn('Ignored invalid native login URL:', error)
    return null
  }
}

function openLoginUrl(rawUrl) {
  const target = getLoginTarget(rawUrl)
  if (!target || rawUrl === lastHandledUrl) return

  const currentTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (target === currentTarget) return

  lastHandledUrl = rawUrl
  window.location.replace(target)
}

export function installNativeAuthLinks() {
  if (installed || !Capacitor.isNativePlatform()) return
  installed = true

  NativeApp.addListener('appUrlOpen', ({ url }) => {
    openLoginUrl(url)
  })
    .then((handle) => {
      listenerHandle = handle
    })
    .catch((error) => {
      console.warn('Could not listen for native login links:', error)
    })

  NativeApp.getLaunchUrl()
    .then(({ url } = {}) => {
      openLoginUrl(url)
    })
    .catch((error) => {
      console.warn('Could not read the native launch URL:', error)
    })
}

export async function removeNativeAuthLinks() {
  try {
    await listenerHandle?.remove?.()
  } finally {
    listenerHandle = null
    installed = false
    lastHandledUrl = ''
  }
}
