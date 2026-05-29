import { useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import Modal from '../components/Modal'
import { formatTime } from '../lib/billing'
import { useEffect } from 'react'

const SORTS = [
  { key: 'total_hours',  label: 'Hours' },
  { key: 'total_frames', label: 'Frames' },
  { key: 'total_spent',  label: 'Spent' },
  { key: 'visits',       label: 'Visits' },
]

function statDisplay(c, sortKey) {
  switch (sortKey) {
    case 'total_hours':  return { val: c.total_hours?.toFixed(1) + 'h', lbl: 'hours played' }
    case 'total_frames': return { val: c.total_frames + ' fr', lbl: 'frames played' }
    case 'total_spent':  return { val: '₹' + Math.round(c.total_spent || 0), lbl: 'total spent' }
    case 'visits':       return { val: c.visits, lbl: 'visits' }
    default: return { val: '-', lbl: '' }
  }
}

function rankClass(i) {
  if (i === 0) return 'gold'
  if (i === 1) return 'silver'
  if (i === 2) return 'bronze'
  return ''
}

export default function PlayersScreen() {
  const { state, dispatch, refreshCustomers } = useApp()
  const showToast = useToast()
  const [sort, setSort] = useState('total_hours')
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [playerSessions, setPlayerSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const sorted = [...state.customers].sort((a, b) => (b[sort] || 0) - (a[sort] || 0))

  async function openPlayer(c) {
    setSelected(c)
    setLoadingSessions(true)
    const { data } = await supabase
      .from('session_players')
      .select('*, sessions(*)')
      .eq('customer_id', c.id)
      .order('created_at', { referencedTable: 'sessions', ascending: false })
      .limit(20)
    setPlayerSessions(data || [])
    setLoadingSessions(false)
  }

  async function saveCustomer() {
    if (!addName.trim()) { showToast('Enter a name', 'error'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: addName.trim(), phone: addPhone.trim() || null })
      .select()
      .single()
    if (error) { showToast('Error saving', 'error'); setSaving(false); return }
    dispatch({ type: 'UPSERT_CUSTOMER', customer: data })
    setAddName(''); setAddPhone('')
    setShowAdd(false)
    showToast(data.name + ' added', 'success')
    setSaving(false)
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar-title">Players</div>
        <button className="btn btn-ghost" style={{ padding: '7px 13px', fontSize: 13 }} onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      <div className="scroll-area">
        <div className="filter-bar">
          {SORTS.map(s => (
            <div
              key={s.key}
              className={`filter-chip${sort === s.key ? ' active' : ''}`}
              onClick={() => setSort(s.key)}
            >{s.label}</div>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div className="empty">
            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p>No players yet.<br />Add players or link them during sessions.</p>
          </div>
        ) : sorted.map((c, i) => {
          const { val, lbl } = statDisplay(c, sort)
          return (
            <div key={c.id} className="player-row" onClick={() => openPlayer(c)}>
              <div className={`rank-num ${rankClass(i)}`}>{i + 1}</div>
              <div className="player-avatar">{c.name[0].toUpperCase()}</div>
              <div className="player-info">
                <div className="player-name">
                  {c.name}
                  {c.pending_balance > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--mono)', marginLeft: 6 }}>
                      ₹{c.pending_balance} owed
                    </span>
                  )}
                </div>
                <div className="player-meta">{c.phone || 'No phone'}</div>
              </div>
              <div>
                <div className="player-stat-val">{val}</div>
                <div className="player-stat-lbl">{lbl}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Player Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="detail-header" style={{ margin: '-20px -18px 20px', padding: '16px 18px', borderRadius: 0 }}>
              <div className="detail-avatar">{selected.name[0].toUpperCase()}</div>
              <div>
                <div className="detail-name">{selected.name}</div>
                <div className="detail-sub">
                  {selected.phone || 'No phone'} · since {new Date(selected.join_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </div>
                {selected.pending_balance > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                    Pending balance: ₹{selected.pending_balance}
                  </div>
                )}
              </div>
            </div>

            <div className="stat-grid" style={{ marginBottom: 20 }}>
              {[
                { label: 'Hours Played', value: (selected.total_hours || 0).toFixed(1) + 'h', cls: 'clr-blue' },
                { label: 'Frames', value: selected.total_frames || 0, cls: '' },
                { label: 'Total Spent', value: '₹' + Math.round(selected.total_spent || 0), cls: 'clr-green' },
                { label: 'Visits', value: selected.visits || 0, cls: '' },
                { label: 'Avg / Visit', value: selected.visits ? '₹' + Math.round((selected.total_spent || 0) / selected.visits) : '—', cls: '' },
                { label: 'Last Seen', value: selected.last_seen ? new Date(selected.last_seen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never', cls: 'clr-muted' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className={`stat-value ${s.cls}`} style={{ fontSize: 18 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="section-label">Session History</div>
            {loadingSessions ? (
              <div className="loading"><div className="spinner" /></div>
            ) : playerSessions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No sessions recorded yet.</div>
            ) : playerSessions.map(sp => (
              <div key={sp.id} className="history-row">
                <div className="history-date">
                  {sp.sessions ? new Date(sp.sessions.start_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                </div>
                <div className="history-info">
                  <div className="history-table">{sp.sessions?.table_name || '—'}</div>
                  <div className="history-detail">
                    {sp.sessions?.billing_mode === 'frame' ? sp.sessions.frames + ' frames' : formatTime(sp.sessions?.elapsed_seconds || 0)}
                    {sp.balance_added > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>+₹{sp.balance_added} to balance</span>}
                  </div>
                </div>
                <div className="history-amount clr-green">₹{sp.amount_paid}</div>
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* Add Customer Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-title">Add Player</div>
        <div className="modal-sub">Save a new player profile</div>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="form-input" placeholder="Full name" value={addName} onChange={e => setAddName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="form-input" type="tel" placeholder="+91 98765 43210" value={addPhone} onChange={e => setAddPhone(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-full" onClick={saveCustomer} disabled={saving}>
          {saving ? 'Saving...' : 'Save Player'}
        </button>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-full" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}
