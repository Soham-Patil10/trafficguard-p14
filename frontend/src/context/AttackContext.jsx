import { createContext, useContext, useState, useCallback } from 'react'
import { toggleDefence as apiToggleDefence } from '../api/client'

const AttackContext = createContext(null)

export function AttackProvider({ children }) {
  const [attacks, setAttacks] = useState({
    fgsm: { enabled: true, epsilon: 0.1 },
    pgd: { enabled: false, epsilon: 0.1, iterations: 40 },
    labelflip: { enabled: false, rate: 10 },
    backdoor: { enabled: false },
  })

  const [defences, setDefences] = useState({
    advtrain: { enabled: true, robustAcc: 72.3 },
    jpeg: { enabled: false, quality: 75 },
    smooth: { enabled: false, windowSize: 3 },
    rs: { enabled: false, sigma: 0.25 },
    ensemble: { enabled: false },
  })

  const [metrics, setMetrics] = useState({
    cleanAcc: 83.4,
    robustAcc: 61.2,
    asr: 38.8,
    certifiedRadius: 0.25,
  })

  const toggleAttack = useCallback((name) => {
    setAttacks(prev => ({
      ...prev,
      [name]: { ...prev[name], enabled: !prev[name].enabled },
    }))
  }, [])

  const setEpsilon = useCallback((attack, value) => {
    setAttacks(prev => ({
      ...prev,
      [attack]: { ...prev[attack], epsilon: value },
    }))
  }, [])

  const toggleDef = useCallback(
    async (name) => {
      const newEnabled = !defences[name].enabled
      setDefences(prev => ({
        ...prev,
        [name]: { ...prev[name], enabled: newEnabled },
      }))
      try {
        await apiToggleDefence(name, newEnabled)
      } catch (e) {
        console.error('Defence toggle failed', e)
      }
    },
    [defences]
  )

  return (
    <AttackContext.Provider
      value={{ attacks, defences, metrics, setMetrics, toggleAttack, setEpsilon, toggleDef }}
    >
      {children}
    </AttackContext.Provider>
  )
}

export const useAttack = () => {
  const ctx = useContext(AttackContext)
  if (!ctx) throw new Error('useAttack must be used inside AttackProvider')
  return ctx
}
