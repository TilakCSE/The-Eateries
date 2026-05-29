import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

export default function PinScreen({ onAuth }) {
  const [buf, setBuf] = useState('')
  const [error, setError] = useState(false)
  const showToast = useToast()

  function press(d) {
    if (buf.length >= 4) return
    setBuf(b => b + d)
  }

  function del() {
    setBuf(b => b.slice(0, -1))
    setError(false)
  }

  async function enter() {
    if (buf.length < 4) return
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pin')
      .single()
    const correctPin = data?.value || '1234'
    if (buf === correctPin) {
      onAuth()
    } else {
      setError(true)
      setTimeout(() => { setError(false); setBuf('') }, 700)
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9']

  return (
    <div className="pin-screen" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="pin-logo">
        <div className="pin-logo-mark">
          <svg viewBox="0 0 24 24">
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="pin-name">The Eateries</div>
        <div className="pin-sub">admin panel</div>
      </div>

      <div className="pin-dots">
        {[0,1,2,3].map(i => (
          <div key={i} className={`pin-dot${buf.length > i ? ' filled' : ''}${error ? ' error' : ''}`} />
        ))}
      </div>

      <div className="pin-grid">
        {keys.map(k => (
          <button key={k} className="pin-key" onClick={() => press(k)}>{k}</button>
        ))}
        <button className="pin-key del" onClick={del}>⌫</button>
        <button className="pin-key" onClick={() => press('0')}>0</button>
        <button className="pin-key enter" onClick={enter}>OK</button>
      </div>

      <div className="pin-error">{error ? 'Incorrect PIN' : ''}</div>
    </div>
  )
}
