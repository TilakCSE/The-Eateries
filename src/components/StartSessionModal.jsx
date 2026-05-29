import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { useToast } from '../lib/toast'

export default function StartSessionModal({ table, open, onClose, onStarted }) {
  const { state, dispatch } = useApp()
  const showToast = useToast()
  
  const [players, setPlayers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [billingMode, setBillingMode] = useState('hourly')
  const [frameCount, setFrameCount] = useState('')

  function reset() {
    setPlayers([])
    setSearchQuery('')
    setBillingMode('hourly')
    setFrameCount('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function addPlayer(customer) {
    if (players.find(p => p.customerId === customer.id)) return
    if (players.length >= 6) { showToast('Max 6 players', 'error'); return }
    setPlayers(p => [...p, { name: customer.name, customerId: customer.id }])
    setSearchQuery('') // Reset search after picking someone
  }

  function removePlayerById(customerId) {
    setPlayers(p => p.filter(x => x.customerId !== customerId))
  }

  function getBusinessDate(dateString) {
    if (!dateString) return null
    const d = new Date(dateString)
    d.setHours(d.getHours() - 11)
    return d.toISOString().split('T')[0]
  }

  async function startSession() {
    if (players.length === 0) { showToast('Add at least one player', 'error'); return }
    if (billingMode === 'frame' && (!frameCount || parseInt(frameCount) < 1)) {
      showToast('Enter number of frames', 'error'); return
    }
    
    onClose()
    if (onStarted) onStarted()
    showToast('Starting table...', 'success')

    try {
      const { data: session, error: sessErr } = await supabase
        .from('sessions')
        .insert({
          table_id: table.id,
          table_name: table.name,
          table_type: table.type,
          billing_mode: billingMode,
          frames: billingMode === 'frame' ? parseInt(frameCount) : 0,
          start_time: new Date().toISOString(),
          status: 'active',
        })
        .select()
        .single()
        
      if (sessErr) throw sessErr

      const playerRows = players.map(p => ({
        session_id: session.id,
        customer_id: p.customerId || null,
        player_name: p.name,
        amount_paid: 0,
        balance_added: 0,
      }))
      await supabase.from('session_players').insert(playerRows)
      await supabase.from('tables').update({ status: 'occupied', session_id: session.id }).eq('id', table.id)

      const currentBusinessDate = getBusinessDate(new Date().toISOString())
      for (const p of players) {
        if (!p.customerId) continue
        const customer = state.customers.find(c => c.id === p.customerId)
        if (!customer) continue

        const lastSeenBusinessDate = getBusinessDate(customer.last_seen)
        let visitsToUpdate = customer.visits || 0
        if (currentBusinessDate !== lastSeenBusinessDate) { visitsToUpdate += 1 }

        await supabase.from('customers').update({ last_seen: new Date().toISOString(), visits: visitsToUpdate }).eq('id', p.customerId)
      }

      dispatch({ type: 'SET_TABLE_STATUS', tableId: table.id, status: 'occupied', sessionId: session.id })
      dispatch({ type: 'UPSERT_SESSION', tableId: table.id, session: { ...session, session_players: playerRows } })
      
      reset()
    } catch (e) {
      showToast('Network error starting session', 'error')
      console.error(e)
    }
  }

  // Filter customers and format with phone number
  const filteredCustomers = state.customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.phone && c.phone.includes(searchQuery))
  ).slice(0, 8).map(c => {
    const phoneExt = c.phone ? c.phone.slice(-4) : 'XXXX'
    return { ...c, displayName: `${c.name} (${phoneExt})` }
  })

  if (!table) return null

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="modal-title" style={{ fontSize: '1.5rem' }}>Start Session</div>
      <div className="modal-sub" style={{ fontSize: '1.1rem', marginBottom: 20 }}>{table.name} · {table.type === 'snooker' ? 'Snooker' : 'Pool'}</div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '1rem' }}>Selected Players</label>
        <div className="player-chips" style={{ minHeight: 45 }}>
          {players.length === 0 && <span style={{ fontSize: 14, color: 'var(--text3)' }}>Tap players below to add</span>}
          {players.map((p, i) => (
            <div key={i} className="player-chip" style={{ padding: '8px 12px', fontSize: '1rem' }}>
              <span className="chip-name">{p.name}</span>
              {/* FIX: Explicitly call remove using the ID */}
              <span className="chip-remove" style={{ marginLeft: 8, padding: '0 4px' }} onClick={() => removePlayerById(p.customerId)}>×</span>
            </div>
          ))}
        </div>

        <input
          className="form-input"
          style={{ fontSize: '1.1rem', padding: '14px', marginTop: 10 }}
          placeholder="🔍 Search name to add..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        
        <div className="pill-group" style={{ marginTop: 12 }}>
          {filteredCustomers.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: 10 }}>No players found. Register them first.</div>
          ) : (
            filteredCustomers.map(c => {
              const isSelected = players.find(p => p.customerId === c.id)
              if (isSelected) return null // Hide from quick add if already selected
              
              return (
                <div 
                  key={c.id} 
                  className="pill" 
                  onClick={() => addPlayer(c)}
                  style={{ padding: '10px 16px', fontSize: '1.1rem' }}
                >
                  {c.displayName}
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '1rem' }}>Billing Mode</label>
        <div className="pill-group">
          {[['hourly', 'Hourly Timer'], ['frame', 'By Frames']].map(([m, label]) => (
            <div
              key={m}
              className={`pill${billingMode === m ? ' selected' : ''}`}
              style={{ flex: 1, textAlign: 'center', padding: '12px', fontSize: '1.1rem' }}
              onClick={() => setBillingMode(m)}
            >{label}</div>
          ))}
        </div>
      </div>

      {billingMode === 'frame' && (
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '1rem' }}>Number of Frames</label>
          <input
            className="form-input mono"
            type="number"
            min="1"
            style={{ fontSize: '1.2rem', padding: '12px' }}
            placeholder="e.g. 3"
            value={frameCount}
            onChange={e => setFrameCount(e.target.value)}
          />
        </div>
      )}

      <button className="btn btn-primary btn-full" style={{ fontSize: '1.2rem', padding: '16px' }} onClick={startSession}>
        ▶ Start Session
      </button>
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-full" style={{ fontSize: '1.1rem', padding: '12px' }} onClick={handleClose}>Cancel</button>
      </div>
    </Modal>
  )
}