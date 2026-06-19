import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { toggleDefence as apiToggleDefence, getMetrics } from '../api/client'

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
    cleanAcc: null,      // filled from the backend (original model accuracy)
    robustAcc: null,     // N/A until a robustness sweep is run
    asr: null,           // N/A until computed
    certifiedRadius: null, // N/A until certified-radius is computed
  })

  // Shared hand-off: the most recent attack result, consumed by the Defence Lab
  const [lastAttackResult, setLastAttackResult] = useState(null)

  // Persistent Attack Lab input: the uploaded/selected clean image. Lives in
  // context so it survives page switches and only clears when the user clears it.
  const [cleanInput, setCleanInput] = useState(null) // { image, name } | null

  // Live metrics: poll the backend so the StatCards reflect real attack activity.
  // Falls back silently to the defaults above if the backend isn't running.
  useEffect(() => {
    let alive = true
    const poll = () =>
      getMetrics()
        .then((res) => {
          if (alive && res && res.data) {
            setMetrics((prev) => ({ ...prev, ...res.data }))
          }
        })
        .catch(() => {})
    poll()
    const id = setInterval(poll, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

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
      value={{ attacks, defences, metrics, setMetrics, toggleAttack, setEpsilon, toggleDef, lastAttackResult, setLastAttackResult, cleanInput, setCleanInput }}
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
