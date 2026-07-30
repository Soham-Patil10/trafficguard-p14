import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toggleDefence as apiToggleDefence, getMetrics } from '../api/client'

const AttackContext = createContext(null)

export function AttackProvider({ children }) {
  const navigate = useNavigate()
  const [attacks, setAttacks] = useState({
    fgsm: { enabled: true, epsilon: 0.1 },
    pgd: { enabled: false, epsilon: 0.1, iterations: 40 },
    deepfool: { enabled: false, maxIter: 50 },
    labelflip: { enabled: false, rate: 10 },
  })

  const [defences, setDefences] = useState({
  adv_train: { enabled: false },
  smooth: { enabled: true, windowSize: 3 },
  rs: { enabled: false, sigma: 0.25 },
  diffusion: { enabled: false },
})

  const [metrics, setMetrics] = useState({
    cleanAcc: null,      // filled from the backend (original model accuracy)
    robustAcc: null,     // N/A until a robustness sweep is run
    asr: null,           // N/A until computed
    certifiedRadius: null, // N/A until certified-radius is computed
  })

  // Shared hand-off: the most recent attack result, consumed by the Defence Lab
  const [lastAttackResult, setLastAttackResult] = useState(null)
  const [lastDefenceResult, setLastDefenceResult] = useState(null)

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
    const turningOn = !attacks[name].enabled
    setAttacks(prev => {
      const next = {}
      for (const key of Object.keys(prev)) {
        next[key] = {
          ...prev[key],
          // Only the toggled attack can end up enabled; every other attack is forced off.
          enabled: key === name ? turningOn : false,
        }
      }
      return next
    })
    // Label Flipping is training-time — it can't run per-image, so switching it
    // on jumps straight to the Comparison page instead of leaving a dead toggle.
    if (name === 'labelflip' && turningOn) {
      navigate('/compare')
    }
  }, [attacks, navigate])

  const setEpsilon = useCallback((attack, value) => {
    setAttacks(prev => ({
      ...prev,
      [attack]: { ...prev[attack], epsilon: value },
    }))
  }, [])

  // Shared poison-rate selector: read by the Comparison page, settable from
  // anywhere (e.g. Attack Lab) so the choice survives navigation.
  const setLabelFlipRate = useCallback((rate) => {
    setAttacks(prev => ({
      ...prev,
      labelflip: { ...prev.labelflip, rate },
    }))
  }, [])

  const toggleDef = useCallback(
    async (name) => {
      const turningOn = !defences[name].enabled

      // Any other defence that was on needs to be switched off, both in
      // local state and on the backend, so only one defence is ever active.
      const othersToDisable = Object.keys(defences).filter(
        (key) => key !== name && defences[key].enabled
      )

      setDefences(prev => {
        const next = {}
        for (const key of Object.keys(prev)) {
          next[key] = {
            ...prev[key],
            enabled: key === name ? turningOn : false,
          }
        }
        return next
      })

      try {
        await apiToggleDefence(name, turningOn)
        await Promise.all(
          othersToDisable.map((key) => apiToggleDefence(key, false))
        )
      } catch (e) {
        console.error('Defence toggle failed', e)
      }
    },
    [defences]
  )

  return (
    <AttackContext.Provider
      value={{ attacks, defences, metrics, setMetrics, toggleAttack, setEpsilon, setLabelFlipRate, toggleDef, lastAttackResult, setLastAttackResult, lastDefenceResult, setLastDefenceResult, cleanInput, setCleanInput }}
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
