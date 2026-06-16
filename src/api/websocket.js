class TrafficGuardWS {
  ws = null
  handlers = new Set()
  url = 'ws://localhost:8000/ws/stream'

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
