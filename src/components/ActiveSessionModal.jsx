import { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { useToast } from '../lib/toast'
import { getElapsedSeconds, formatTime } from '../lib/billing'

export default function ActiveSessionModal({ table, open, onClose, onStop, onCancel }) {
  const { state, dispatch } = useApp()
  const showToast = useToast()
  const [elapsed, setElapsed] = useState(0)
  const [addName, setAddName] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [removingPlayer, setRemovingPlayer] = useState(null)
  
  const intervalRef = useRef(null)

  const session = table ? state.activeSessions[table.id] : null

  useEffect(() => {
    if (!open || !session) return
    setElapsed(getElapsedSeconds(session.start_time))
    intervalRef.current = setInterval(() => {
      setElapsed(getElapsedSeconds(session.start_time))
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [open, session?.start_time])

  async function addPlayer() {
    const name = addName.trim()
    if (!name || !session) return
    
    // Quick resolve for known customers via name match
    const existingCust = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())
    
    const { data, error } = await supabase.from('session_players').insert({
      session_id: session.id,
      player_name: name,
      customer_id: existingCust ? existingCust.id : null,
      amount_paid: 0,
      balance_added: 0,
    }).select().single()
    
    if (error) {
      showToast('Failed to add player', 'error')
      return
    }

    const updated = {
      ...session,
      session_players: [
        ...(session.session_players || []),
        data // Insert the returned row which has the proper ID
      ]
    }
    dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: updated })
    setAddName('')
    showToast(name + ' added', 'success')
  }

  async function removePlayer(playerId, playerName) {
    if (!session || !playerId) return
    
    setLoading(true)
    const { error } = await supabase.from('session_players').delete().eq('id', playerId)
    
    if (error) {
      showToast('Error removing player', 'error')
    } else {
      const updated = {
        ...session,
        session_players: session.session_players.filter(p => p.id !== playerId)
      }
      dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: updated })
      showToast(playerName + ' removed', '')
    }
    setLoading(false)
    setRemovingPlayer(null)
  }

  async function addFrame() {
    if (!session || session.billing_mode !== 'frame') return
    
    setLoading(true)
    const newFrames = (session.frames || 0) + 1
    
    const { error } = await supabase.from('sessions').update({ frames: newFrames }).eq('id', session.id)
    
    if (error) {
       showToast('Error updating frames', 'error')
    } else {
       const updated = { ...session, frames: newFrames }
       dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: updated })
       showToast('+1 Frame Added', 'success')
    }
    setLoading(false)
  }

  async function cancelSession() {
    if (!session) return
    setLoading(true)
    await supabase.from('sessions').delete().eq('id', session.id)
    await supabase.from('tables').update({ status: 'free', session_id: null }).eq('id', table.id)
    dispatch({ type: 'REMOVE_SESSION', tableId: table.id })
    dispatch({ type: 'SET_TABLE_STATUS', tableId: table.id, status: 'free', sessionId: null })
    setLoading(false)
    setShowCancelConfirm(false)
    onClose()
    if (onCancel) onCancel()
    showToast('Session cleared', '')
  }

  function handleStop() {
    clearInterval(intervalRef.current)
    onClose()
    if (onStop) onStop(session, elapsed)
  }

  if (!table || !session) return null

  const players = session.session_players || []
  const modeLabel = session.billing_mode === 'frame'
    ? `${session.frames} frames`
    : 'Hourly'

  return (
    <Modal open={open} onClose={onClose}>
      {showCancelConfirm ? (
        <>
          <div className="modal-title">Clear Table?</div>
          <div className="modal-sub">{table.name}</div>
          <div className="cancel-warning">
            This will delete the session with no record and free the table.
            No bill will be generated. This cannot be undone.
          </div>
          <div className="btn-row">
            <button className="btn btn-danger btn-full" onClick={cancelSession} disabled={loading}>
              {loading ? 'Clearing...' : 'Yes, Clear Table'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowCancelConfirm(false)}>
              Go Back
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="modal-title">{table.name}</div>
          <div className="modal-sub">{modeLabel} · started {new Date(session.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>

          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '20px',
            textAlign: 'center',
            marginBottom: 20,
            position: 'relative'
          }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
              Elapsed Time
            </div>
            <div className={`table-timer ${table.type === 'snooker' ? 'blue' : 'green'}`} style={{ fontSize: 44, margin: 0 }}>
              {formatTime(elapsed)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)' }}>
              Rate: ₹{table.rate_hourly}/hr · ₹{table.rate_frame}/frame · ₹{table.rate_per_player} extra/player
            </div>
            
            {/* Quick action to add a frame mid-game */}
            {session.billing_mode === 'frame' && (
              <button 
                className="btn btn-ghost"
                style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)' }}
                onClick={addFrame}
                disabled={loading}
              >
                +1 Frame
              </button>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Players ({players.length})</label>
            <div className="player-chips" style={{ marginBottom: 10 }}>
              {players.map((p, i) => (
                <div key={i} className="player-chip">
                  <div className="chip-avatar">{p.player_name[0].toUpperCase()}</div>
                  <span className="chip-name">{p.player_name}</span>
                  
                  {/* Click to remove functionality */}
                  {removingPlayer === p.id ? (
                     <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => removePlayer(p.id, p.player_name)}>Confirm?</span>
                  ) : (
                     <span className="chip-remove" onClick={() => setRemovingPlayer(p.id)}>×</span>
                  )}
                </div>
              ))}
            </div>
            <div className="add-row">
              <input
                className="form-input"
                placeholder="Add player to session..."
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
              />
              <button className="add-btn" onClick={addPlayer}>+</button>
            </div>
          </div>

          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleStop}>
              ⏹ Stop & Bill
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Back</button>
          </div>
          <button
            className="btn btn-full"
            style={{ background: 'transparent', color: 'var(--text3)', fontSize: 13, paddingTop: 6 }}
            onClick={() => setShowCancelConfirm(true)}
          >
            Clear table without billing
          </button>
        </>
      )}
    </Modal>
  )
}