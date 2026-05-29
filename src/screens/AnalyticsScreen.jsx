import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { useToast } from '../lib/toast'

export default function AnalyticsScreen() {
  const { state } = useApp()
  const showToast = useToast()
  
  const [timeframe, setTimeframe] = useState('today')
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState({
    totalRev: 0, cash: 0, upi: 0, settled: 0, 
    sessions: 0, frames: 0, topSpenders: [], topHours: []
  })

  function getDateRange(tf) {
    const now = new Date()
    let start = new Date(now)
    
    start.setHours(start.getHours() - 11)
    start.setHours(0, 0, 0, 0)
    start.setHours(start.getHours() + 11)
    
    if (tf === 'week') start.setDate(start.getDate() - 6)
    if (tf === 'month') start.setDate(start.getDate() - 29)
    if (tf === 'all') return { start: null, end: now.toISOString() }
    
    return { start: start.toISOString(), end: now.toISOString() }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [timeframe])

  async function fetchAnalytics() {
    setLoading(true)
    const { start } = getDateRange(timeframe)
    
    try {
      let sessQuery = supabase.from('sessions').select('*, session_players(*)').eq('status', 'completed')
      if (start) sessQuery = sessQuery.gte('end_time', start)
      const { data: sessions } = await sessQuery

      let txQuery = supabase.from('balance_transactions').select('*').eq('type', 'settled')
      if (start) txQuery = txQuery.gte('created_at', start)
      const { data: transactions } = await txQuery

      let cash = 0, upi = 0, totalFrames = 0
      const playerSpends = {}
      const playerHours = {}

      sessions?.forEach(s => {
        totalFrames += (s.frames || 0)
        
        const sessionPaid = s.session_players.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
        if (s.payment_method === 'upi') upi += sessionPaid
        else cash += sessionPaid

        const hoursInSession = (s.elapsed_seconds || 0) / 3600

        s.session_players.forEach(p => {
          if (p.customer_id) {
            if (p.amount_paid > 0) {
              playerSpends[p.customer_id] = (playerSpends[p.customer_id] || 0) + p.amount_paid
            }
            // Add hours played to this customer for this specific timeframe
            playerHours[p.customer_id] = (playerHours[p.customer_id] || 0) + hoursInSession
          }
        })
      })

      let settled = 0
      transactions?.forEach(tx => {
        settled += tx.amount
        if (tx.note?.toLowerCase().includes('upi')) upi += tx.amount
        else cash += tx.amount
        
        if (tx.customer_id) {
          playerSpends[tx.customer_id] = (playerSpends[tx.customer_id] || 0) + tx.amount
        }
      })

      const topSpenders = Object.entries(playerSpends)
        .map(([id, amount]) => {
          const cust = state.customers.find(c => c.id === parseInt(id))
          return { name: cust?.name || 'Unknown', amount }
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)

      const topHours = Object.entries(playerHours)
        .map(([id, hours]) => {
          const cust = state.customers.find(c => c.id === parseInt(id))
          return { name: cust?.name || 'Unknown', hours }
        })
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 5)

      setMetrics({
        totalRev: cash + upi,
        cash, upi, settled,
        sessions: sessions?.length || 0,
        frames: totalFrames,
        topSpenders,
        topHours
      })

    } catch (e) {
      showToast('Error loading analytics', 'error')
    }
    setLoading(false)
  }

  function exportCSV() {
    const rows = [
      ['Analytics Report', `Timeframe: ${timeframe.toUpperCase()}`],
      [''],
      ['Metric', 'Value'],
      ['Total Revenue (INR)', metrics.totalRev],
      ['Cash Collected', metrics.cash],
      ['UPI Collected', metrics.upi],
      ['Debt Settled (Included in total)', metrics.settled],
      ['Total Sessions Played', metrics.sessions],
      ['Total Frames Played', metrics.frames],
      [''],
      ['Top Players (By Money Spent)', 'Amount (INR)'],
    ]

    metrics.topSpenders.forEach(p => rows.push([p.name, p.amount]))
    
    rows.push([''])
    rows.push(['Top Players (By Time Played)', 'Hours'])
    metrics.topHours.forEach(p => rows.push([p.name, p.hours.toFixed(1)]))

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Eateries_Report_${timeframe}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported to CSV', 'success')
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar-title">Analytics</div>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={exportCSV} disabled={loading}>
          ⬇ Export CSV
        </button>
      </div>

      <div className="scroll-area">
        <div className="pill-group" style={{ marginBottom: 20 }}>
          {[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([val, label]) => (
            <div
              key={val}
              className={`pill ${timeframe === val ? 'selected' : ''}`}
              style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: '1.05rem' }}
              onClick={() => setTimeframe(val)}
            >
              {label}
            </div>
          ))}
        </div>

        {loading ? (
           <div className="loading" style={{ marginTop: 40 }}><div className="spinner" /></div>
        ) : (
          <>
            <div className="card" style={{ padding: '24px', textAlign: 'center', marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Total Revenue</div>
              <div style={{ fontSize: 42, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)', lineHeight: 1 }}>
                ₹{metrics.totalRev.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">💵 Cash</div>
                <div className="stat-value" style={{ fontSize: 24, fontFamily: 'var(--mono)' }}>₹{metrics.cash.toLocaleString('en-IN')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">📱 UPI</div>
                <div className="stat-value" style={{ fontSize: 24, fontFamily: 'var(--mono)' }}>₹{metrics.upi.toLocaleString('en-IN')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Sessions</div>
                <div className="stat-value" style={{ fontSize: 24, fontFamily: 'var(--mono)' }}>{metrics.sessions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Debt Settled</div>
                <div className="stat-value" style={{ fontSize: 24, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>₹{metrics.settled.toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Top Spenders */}
            <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>Top Spenders ({timeframe})</div>
            {metrics.topSpenders.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>No player spends recorded.</div>
            ) : (
              metrics.topSpenders.map((p, i) => (
                <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', width: 20 }}>{i + 1}.</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--green)' }}>₹{p.amount.toLocaleString('en-IN')}</div>
                </div>
              ))
            )}

            {/* Top By Time Played */}
            <div className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>Most Time Played ({timeframe})</div>
            {metrics.topHours.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>No play time recorded.</div>
            ) : (
              metrics.topHours.map((p, i) => (
                <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text3)', width: 20 }}>{i + 1}.</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{p.name}</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{p.hours.toFixed(1)} hrs</div>
                </div>
              ))
            )}
            
            <div style={{ height: 20 }} />
          </>
        )}
      </div>
    </div>
  )
}