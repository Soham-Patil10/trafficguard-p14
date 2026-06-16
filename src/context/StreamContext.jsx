import { createContext, useContext, useState, useEffect } from 'react'
import { wsClient } from '../api/websocket'

const StreamContext = createContext(null)

export function StreamProvider({ children }) {
  const [latestFrame, setLatestFrame] = useState(null)
  const [frameHistory, setFrameHistory] = useState([])
  const [logLines, setLogLines] = useState([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    wsClient.connect()
    setConnected(true)

    const handler = (data) => {
      if (data.type === 'frame') {
        setLatestFrame(data)
        setFrameHistory(prev => [data, ...prev].slice(0, 50))
        setLogLines(prev => {
          const cleanPred = String(data.clean_pred ?? '')
          const attackPred = String(data.attack_pred ?? '')
          const newLine = {
            time: String(data.timestamp ?? ''),
            msg: `frame_${data.frame_id} · ${attackPred}`,
            type: cleanPred !== attackPred ? 'attack' : 'info',
          }
          return [newLine, ...prev].slice(0, 100)
        })
      }
    }

    wsClient.subscribe(handler)
    return () => wsClient.unsubscribe(handler)
  }, [])

  return (
    <StreamContext.Provider value={{ latestFrame, frameHistory, logLines, connected }}>
      {children}
    </StreamContext.Provider>
  )
}

export const useStream = () => {
  const ctx = useContext(StreamContext)
  if (!ctx) throw new Error('useStream must be used inside StreamProvider')
  return ctx
}
