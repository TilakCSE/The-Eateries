import { useState, useEffect, useRef } from 'react'
import { useApp } from '../lib/store'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import StartSessionModal from '../components/StartSessionModal'
import ActiveSessionModal from '../components/ActiveSessionModal'
import CheckoutModal from '../components/CheckoutModal'
import { getElapsedSeconds, formatTime } from '../lib/billing'

function TableCard({ table, session, onStart, onView }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!session) return
    setElapsed(getElapsedSeconds(session.start_time))
    const iv = setInterval(() => setElapsed(getElapsedSeconds(session.start_time)), 1000)
    return () => clearInterval(iv)
  }, [session?.start_time])

  const isOccupied = table.status === 'occupied'
  const players = session?.session_players || []

  return (
    <div className={`table-card${isOccupied ? ' occupied' : ''}`}>
      <div className="table-card-top">
        <div>
          <div className="table-card-name">{table.name}</div>
          <div className="table-card-type">{table.type}</div>
        </div>
        <div className="status-dot" style={{
          background: isOccupied ? 'var(--amber)' : 'var(--green)',
          boxShadow: `0 0 6px ${isOccupied ? 'var(--amber)' : 'var(--green)'}`,
          width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0
        }} />
      </div>

      {isOccupied && session ? (
        <>
          <div className={`table-timer ${table.type === 'snooker' ? 'blue' : 'green'}`}>
            {formatTime(elapsed)}
          </div>
          <div className="table-players-list">
            {players.map(p => p.player_name).join(', ') || '—'}
          </div>
          <div className="table-rate-hint">
            {session.billing_mode === 'frame' ? `${session.frames} frames` : 'Hourly'} · ₹{table.rate_hourly}/hr
          </div>
          <button className="btn btn-ghost btn-full" style={{ fontSize: 13 }} onClick={() => onView(table)}>
            View Session
          </button>
        </>
      ) : (
        <>
          <div style={{ flex: 1, padding: '10px 0' }}>
            <div className="table-rate-hint">₹{table.rate_hourly}/hr · ₹{table.rate_frame}/frame</div>
          </div>
          <button className="btn btn-green btn-full" style={{ fontSize: 13 }} onClick={() => onStart(table)}>
            ▶  Start Session
          </button>
        </>
      )}
    </div>
  )
}

export default function DashboardScreen() {
  const { state, loadInitialData } = useApp()
  const [startTable, setStartTable] = useState(null)
  const [activeTable, setActiveTable] = useState(null)
  const [checkoutData, setCheckoutData] = useState(null) // { table, session, elapsed }

  const today = new Date().toDateString()
  const todaySessions = [] // we won't fetch all here — just show active count

  const occupied = state.tables.filter(t => t.status === 'occupied').length
  const free = state.tables.filter(t => t.status === 'free').length

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

  function handleStop(session, elapsed) {
    const table = state.tables.find(t => t.id === session.table_id)
    setCheckoutData({ table, session, elapsed })
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <div className="topbar-title">The Eateries</div>
          <div className="topbar-sub">{dateStr}</div>
        </div>
      </div>

      <div className="scroll-area">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Active Tables</div>
            <div className={`stat-value ${occupied > 0 ? 'clr-amber' : 'clr-green'}`}>
              {occupied} <span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 400 }}>/ {state.tables.length}</span>
            </div>
            <div className="stat-sub">{free} free right now</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tables</div>
            <div className="stat-value clr-muted">{state.tables.length}</div>
            <div className="stat-sub">
              {state.tables.filter(t => t.type === 'snooker').length} snooker · {state.tables.filter(t => t.type === 'pool').length} pool
            </div>
          </div>
        </div>

        <div className="section-label">Tables</div>
        {state.loading ? (
          <div className="loading"><div className="spinner" />Loading tables...</div>
        ) : (
          <div className="tables-grid">
            {state.tables.map(t => (
              <TableCard
                key={t.id}
                table={t}
                session={state.activeSessions[t.id]}
                onStart={setStartTable}
                onView={setActiveTable}
              />
            ))}
          </div>
        )}
      </div>

      <StartSessionModal
        table={startTable}
        open={!!startTable}
        onClose={() => setStartTable(null)}
      />

      <ActiveSessionModal
        table={activeTable}
        open={!!activeTable}
        onClose={() => setActiveTable(null)}
        onStop={handleStop}
        onCancel={() => setActiveTable(null)}
      />

      <CheckoutModal
        table={checkoutData?.table}
        session={checkoutData?.session}
        elapsedSeconds={checkoutData?.elapsed}
        open={!!checkoutData}
        onClose={() => setCheckoutData(null)}
        onDone={() => setCheckoutData(null)}
      />
    </div>
  )
}
