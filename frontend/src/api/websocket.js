// Mirrors the VITE_API_URL logic in client.js: unset in dev (local backend on
// :8000); set to '' in production so the socket connects same-origin (ws/wss
// chosen from the page's own protocol).
function defaultWsUrl() {
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl === undefined) return 'ws://localhost:8000/ws/stream'
  const base = apiUrl || window.location.origin
  return base.replace(/^http/, 'ws') + '/ws/stream'
}

class TrafficGuardWS {
  ws = null
  handlers = new Set()
  url = defaultWsUrl()

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.handlers.forEach(fn => fn(data))
    }

    this.ws.onclose = () => {
      console.log('WS closed — reconnecting in 2s')
      setTimeout(() => this.connect(), 2000)
    }

    this.ws.onerror = (err) => console.error('WS error', err)
  }

  subscribe(fn) {
    this.handlers.add(fn)
  }

  unsubscribe(fn) {
    this.handlers.delete(fn)
  }

  send(payload) {
    this.ws?.send(JSON.stringify(payload))
  }
}

export const wsClient = new TrafficGuardWS()
