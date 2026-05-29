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
  
  const [loggingFrame, setLoggingFrame] = useState(false)
  const [loserName, setLoserName] = useState(null) // FIXED: Track by name, not ID
  
  const [loading, setLoading] = useState(false)
  const [removingPlayer, setRemovingPlayer] = useState(null)
  
  const intervalRef = useRef(null)
  const session = table ? state.activeSessions[table.id] : null

  useEffect(() => {
    if (!open || !session) return
    setElapsed(getElapsedSeconds(session.start_time))
    intervalRef.current = setInterval(() => setElapsed(getElapsedSeconds(session.start_time)), 1000)
    return () => clearInterval(intervalRef.current)
  }, [open, session?.start_time])

  useEffect(() => {
    if (!loggingFrame) setLoserName(null)
  }, [loggingFrame])

  async function addPlayer() {
    const name = addName.trim()
    if (!name || !session) return
    const existingCust = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase())
    const { data, error } = await supabase.from('session_players').insert({
      session_id: session.id, player_name: name, customer_id: existingCust ? existingCust.id : null, amount_paid: 0, balance_added: 0,
    }).select().single()
    
    if (error) { showToast('Failed to add player', 'error'); return }
    dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: { ...session, session_players: [...(session.session_players || []), data] } })
    setAddName(''); showToast(name + ' added', 'success')
  }

  async function removePlayer(playerId, playerName) {
    if (!session || !playerId) return
    setLoading(true)
    const { error } = await supabase.from('session_players').delete().eq('id', playerId)
    if (!error) {
      dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: { ...session, session_players: session.session_players.filter(p => p.id !== playerId) } })
      showToast(playerName + ' removed', '')
    }
    setLoading(false); setRemovingPlayer(null)
  }

  async function submitFrameResult(action) {
    if (!loserName) { showToast('Select who pays for this frame', 'error'); return }
    setLoading(true)
    
    const players = session.session_players || []
    const loseRow = players.find(p => p.player_name === loserName)
    const winRows = players.filter(p => p.player_name !== loserName)
    
    // Only increment the session frame counter if they clicked "+1 Frame"
    const newFrames = action === 'add' ? (session.frames || 0) + 1 : (session.frames || 0)

    try {
      if (action === 'add') {
        await supabase.from('sessions').update({ frames: newFrames }).eq('id', session.id)
      }

      // Update Loser (Matched strictly by session_id and player_name)
      await supabase.from('session_players').update({ frames_lost: (loseRow.frames_lost || 0) + 1 })
        .eq('session_id', session.id).eq('player_name', loserName)
        
      if (loseRow?.customer_id) {
        const c = state.customers.find(x => x.id === loseRow.customer_id)
        if (c) await supabase.from('customers').update({ total_losses: (c.total_losses || 0) + 1 }).eq('id', c.id)
      }

      // Update Winners
      for (const winRow of winRows) {
        await supabase.from('session_players').update({ frames_won: (winRow.frames_won || 0) + 1 })
          .eq('session_id', session.id).eq('player_name', winRow.player_name)
          
        if (winRow?.customer_id) {
          const c = state.customers.find(x => x.id === winRow.customer_id)
          if (c) await supabase.from('customers').update({ total_wins: (c.total_wins || 0) + 1 }).eq('id', c.id)
        }
      }

      // Update Local State
      const updatedPlayers = players.map(p => {
        if (p.player_name === loserName) return { ...p, frames_lost: (p.frames_lost || 0) + 1 }
        return { ...p, frames_won: (p.frames_won || 0) + 1 }
      })
      const updatedSession = { ...session, frames: newFrames, session_players: updatedPlayers }
      
      dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: updatedSession })
      showToast('Frame logged! 🎱', 'success')
      setLoggingFrame(false)
      
      // If stopping the table, push the freshly calculated stats straight to checkout
      if (action === 'stop') {
        handleStop(updatedSession)
      }
    } catch (e) {
      showToast('Error saving frame', 'error')
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
    setLoading(false); setShowCancelConfirm(false); onClose()
    if (onCancel) onCancel()
    showToast('Session cleared', '')
  }

  function handleStop(latestSession = session) {
    clearInterval(intervalRef.current); onClose()
    if (onStop) onStop(latestSession, elapsed)
  }

  if (!table || !session) return null
  const players = session.session_players || []

  if (loggingFrame) {
    return (
      <Modal open={open} onClose={() => setLoggingFrame(false)}>
        <div className="modal-title">Log Frame Result</div>
        <div className="modal-sub">Frame #{ session.frames || 1 }</div>

        <div style={{ marginTop: 20 }}>
          <label className="form-label" style={{ color: 'var(--red)' }}>💀 Select Loser (Pays for this frame)</label>
          <div className="pill-group" style={{ marginBottom: 30 }}>
            {players.map(p => (
              <div 
                key={p.player_name} 
                className={`pill ${loserName === p.player_name ? 'selected' : ''}`} 
                style={{ borderColor: loserName === p.player_name ? 'var(--red)' : '' }} 
                onClick={() => setLoserName(p.player_name)}
              >
                {p.player_name}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading || !loserName} onClick={() => submitFrameResult('add')}>
              {loading ? 'Saving...' : 'Save & +1 Frame'}
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={loading || !loserName} onClick={() => submitFrameResult('stop')}>
              {loading ? 'Saving...' : 'Save & Stop Table'}
            </button>
          </div>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 10 }} onClick={() => setLoggingFrame(false)}>Cancel</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose}>
      {showCancelConfirm ? (
        <>
          <div className="modal-title">Clear Table?</div>
          <div className="cancel-warning">This will delete the session with no record and free the table.</div>
          <div className="btn-row">
            <button className="btn btn-danger btn-full" onClick={cancelSession} disabled={loading}>Yes, Clear Table</button>
            <button className="btn btn-ghost" onClick={() => setShowCancelConfirm(false)}>Go Back</button>
          </div>
        </>
      ) : (
        <>
          <div className="modal-title">{table.name}</div>
          <div className="modal-sub">{session.billing_mode === 'frame' ? `${session.frames} frames` : 'Hourly'} · started {new Date(session.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px', textAlign: 'center', marginBottom: 20, position: 'relative' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>Elapsed Time</div>
            <div className={`table-timer ${table.type === 'snooker' ? 'blue' : 'green'}`} style={{ fontSize: 44, margin: 0 }}>{formatTime(elapsed)}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)' }}>Rate: ₹{table.rate_hourly}/hr · ₹{table.rate_frame}/frame</div>
            
            {session.billing_mode === 'frame' && players.length >= 2 && (
              <button className="btn btn-ghost" style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)' }} onClick={() => setLoggingFrame(true)}>
                Log Frame
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
                  {p.frames_won > 0 && <span style={{fontSize: 11, color: 'var(--green)', marginLeft: 6}}>{p.frames_won}W</span>}
                  {p.frames_lost > 0 && <span style={{fontSize: 11, color: 'var(--red)', marginLeft: 6}}>{p.frames_lost}L</span>}
                  {removingPlayer === p.id ? (
                     <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => removePlayer(p.id, p.player_name)}>Confirm?</span>
                  ) : (
                     <span className="chip-remove" onClick={() => setRemovingPlayer(p.id)}>×</span>
                  )}
                </div>
              ))}
            </div>
            <div className="add-row">
              <input className="form-input" placeholder="Add player to session..." value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} />
              <button className="add-btn" onClick={addPlayer}>+</button>
            </div>
          </div>

          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => handleStop(session)}>⏹ Stop & Bill</button>
            <button className="btn btn-ghost" onClick={onClose}>Back</button>
          </div>
          <button className="btn btn-full" style={{ background: 'transparent', color: 'var(--text3)', fontSize: 13, paddingTop: 6 }} onClick={() => setShowCancelConfirm(true)}>
            Clear table without billing
          </button>
        </>
      )}
    </Modal>
  )
}