import { useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import Modal from '../components/Modal'
import { formatDateTime } from '../lib/billing'

export default function BalancesScreen() {
  const { state, dispatch } = useApp()
  const showToast = useToast()
  
  const [searchQuery, setSearchQuery] = useState('') // New Search State
  
  const [settling, setSettling] = useState(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [settleMethod, setSettleMethod] = useState('cash')
  
  const [addingCharge, setAddingCharge] = useState(null)
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeNote, setChargeNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [txHistory, setTxHistory] = useState([])
  const [showHistory, setShowHistory] = useState(null)

  // Filter lists based on search query
  const query = searchQuery.toLowerCase()
  
  const withBalance = state.customers
    .filter(c => c.pending_balance > 0)
    .filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)))
    .sort((a, b) => b.pending_balance - a.pending_balance)

  const settledPlayers = state.customers
    .filter(c => !c.pending_balance || c.pending_balance === 0)
    .filter(c => c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query)))

  // Only calculate total owed for the unfiltered list so the topbar number remains accurate
  const totalOwed = state.customers.filter(c => c.pending_balance > 0).reduce((s, c) => s + c.pending_balance, 0)

  function openSettle(c) {
    setSettling(c)
    setSettleAmount(String(c.pending_balance))
    setSettleMethod('cash')
  }

  function openAddCharge(c) {
    setAddingCharge(c)
    setChargeAmount('')
    setChargeNote('')
  }

  async function confirmSettle() {
    if (!settling) return
    const amt = parseFloat(settleAmount) || 0
    if (amt <= 0) { showToast('Enter amount', 'error'); return }
    if (amt > settling.pending_balance) { showToast('Amount exceeds balance', 'error'); return }
    setLoading(true)
    try {
      const newBalance = settling.pending_balance - amt
      const newTotalSpent = (settling.total_spent || 0) + amt
      
      await supabase.from('customers').update({ 
        pending_balance: newBalance,
        total_spent: newTotalSpent
      }).eq('id', settling.id)
      
      await supabase.from('balance_transactions').insert({
        customer_id: settling.id,
        amount: amt,
        type: 'settled',
        note: `Settled via ${settleMethod}`,
      })
      dispatch({ type: 'UPSERT_CUSTOMER', customer: { ...settling, pending_balance: newBalance, total_spent: newTotalSpent } })
      showToast(`₹${amt} settled from ${settling.name}`, 'success')
      setSettling(null)
    } catch (e) {
      showToast('Error settling', 'error')
    }
    setLoading(false)
  }

  function sendWhatsAppReminder(customer) {
    if (!customer.phone) {
      showToast('No phone number saved for this player', 'error')
      return
    }

    // Clean the phone number (removes spaces, dashes, etc.)
    let phone = customer.phone.replace(/[^0-9]/g, '')
    
    // Automatically add India country code (+91) if they just typed 10 digits
    if (phone.length === 10) {
      phone = '91' + phone
    }

    // The message that will be pre-filled
    const message = `Hi ${customer.name}, this is a gentle reminder from The Eateries. Your current pending balance is ₹${customer.pending_balance}. Please clear it on your next visit. Thank you!`
    
    // Create the deep link and open it
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  async function confirmAddCharge() {
    if (!addingCharge) return
    const amt = parseFloat(chargeAmount) || 0
    if (amt <= 0) { showToast('Enter amount', 'error'); return }
    setLoading(true)
    try {
      const newBalance = (addingCharge.pending_balance || 0) + amt
      await supabase.from('customers').update({ pending_balance: newBalance }).eq('id', addingCharge.id)
      
      await supabase.from('balance_transactions').insert({
        customer_id: addingCharge.id,
        amount: amt,
        type: 'added',
        note: chargeNote || 'Manual charge adjustment'
      })
      dispatch({ type: 'UPSERT_CUSTOMER', customer: { ...addingCharge, pending_balance: newBalance } })
      showToast(`₹${amt} added to ${addingCharge.name}'s balance`, 'success')
      setAddingCharge(null)
    } catch (e) {
      showToast('Error adding charge', 'error')
    }
    setLoading(false)
  }

  async function openHistory(c) {
    setShowHistory(c)
    const { data } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('customer_id', c.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setTxHistory(data || [])
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar-title">Balances</div>
        {totalOwed > 0 && (
          <div style={{ fontSize: 13, color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 500 }}>
            ₹{Math.round(totalOwed)} total owed
          </div>
        )}
      </div>

      <div className="scroll-area">
        {/* Search Input */}
        <input
          className="form-input"
          placeholder="🔍 Search name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ marginBottom: 16, fontSize: '1.1rem', padding: '14px' }}
        />

        {withBalance.length === 0 && searchQuery === '' ? (
          <div className="empty">
            <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p>No pending balances.<br />All players are settled up.</p>
          </div>
        ) : (
          <>
            {withBalance.length > 0 && (
              <div className="section-label" style={{ marginBottom: 12 }}>
                {withBalance.length} player{withBalance.length > 1 ? 's' : ''} with pending balance
              </div>
            )}

            {withBalance.map(c => (
              <div key={c.id} className="card" style={{ padding: '16px', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div className="player-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{c.name[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {c.phone || 'No phone'} · {c.visits || 0} visits
                    </div>
                  </div>
                  <div className="balance-amount" style={{ fontSize: '1.4rem', color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    ₹{c.pending_balance}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green" style={{ flex: 2, padding: '10px 0' }} onClick={() => openSettle(c)}>Settle</button>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 0' }} onClick={() => openAddCharge(c)}>+ Charge</button>
                  <button 
                    className="icon-btn" 
                    style={{ width: 42, height: 42, flexShrink: 0, color: '#25D366', borderColor: 'rgba(37, 211, 102, 0.3)' }} 
                    onClick={() => sendWhatsAppReminder(c)}
                    title="Send WhatsApp Reminder"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                  </button>
                  <button className="icon-btn" style={{ width: 42, height: 42, flexShrink: 0 }} onClick={() => openHistory(c)}>
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {settledPlayers.length > 0 && (
          <>
            <hr className="divider" />
            <div className="section-label" style={{ marginBottom: 10 }}>Settled players</div>
            {settledPlayers.map(c => (
              <div key={c.id} className="card" style={{ padding: '16px', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div className="player-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{c.name[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{c.phone || 'No phone'}</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', color: 'var(--green)', fontFamily: 'var(--mono)' }}>✓ Clear</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 0' }} onClick={() => openAddCharge(c)}>+ Charge</button>
                  <button className="icon-btn" style={{ width: 42, height: 42, flexShrink: 0 }} onClick={() => openHistory(c)}>
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Settle Modal */}
      <Modal open={!!settling} onClose={() => setSettling(null)}>
        {settling && (
          <>
            <div className="modal-title">Settle Balance</div>
            <div className="modal-sub">{settling.name} owes ₹{settling.pending_balance}</div>
            <div className="form-group">
              <label className="form-label">Amount to collect</label>
              <input className="amount-input-big" type="number" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} max={settling.pending_balance} min="1"/>
              <div className="amount-hint">Full balance: ₹{settling.pending_balance}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <div className="pm-grid">
                {[['cash','💵  Cash'], ['upi','📱  UPI']].map(([m, label]) => (
                  <button key={m} className={`pm-btn${settleMethod === m ? ' selected' : ''}`} onClick={() => setSettleMethod(m)}>{label}</button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={confirmSettle} disabled={loading}>{loading ? 'Processing...' : `Collect ₹${settleAmount || 0}`}</button>
            <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-full" onClick={() => setSettling(null)}>Cancel</button></div>
          </>
        )}
      </Modal>

      {/* Add Charge Modal */}
      <Modal open={!!addingCharge} onClose={() => setAddingCharge(null)}>
        {addingCharge && (
          <>
            <div className="modal-title">Add Manual Charge</div>
            <div className="modal-sub">Add debt to {addingCharge.name}'s balance</div>
            <div className="form-group">
              <label className="form-label">Amount to add</label>
              <input className="amount-input-big" type="number" placeholder="₹ 0" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} min="1"/>
            </div>
            <div className="form-group">
              <label className="form-label">Reason / Note (Optional)</label>
              <input style={{ width: '100%', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }} type="text" placeholder="e.g. Fine, Snacks, Past due..." value={chargeNote} onChange={e => setChargeNote(e.target.value)}/>
            </div>
            <button className="btn btn-primary btn-full" onClick={confirmAddCharge} disabled={loading || !chargeAmount}>{loading ? 'Processing...' : `Add ₹${chargeAmount || 0} to Balance`}</button>
            <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-full" onClick={() => setAddingCharge(null)}>Cancel</button></div>
          </>
        )}
      </Modal>

      {/* History Modal */}
      <Modal open={!!showHistory} onClose={() => setShowHistory(null)}>
        {showHistory && (
          <>
            <div className="modal-title">{showHistory.name}</div>
            <div className="modal-sub">Balance history</div>
            {txHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No transactions yet.</div>
            ) : txHistory.map(tx => (
              <div key={tx.id} className="history-row">
                <div className="history-date">{formatDateTime(tx.created_at)}</div>
                <div className="history-info">
                  <div className="history-table" style={{ color: tx.type === 'added' ? 'var(--red)' : 'var(--green)' }}>
                    {tx.type === 'added' ? '+ Added to balance' : '✓ Settled'}
                  </div>
                  <div className="history-detail">{tx.note || ''}</div>
                </div>
                <div className="history-amount" style={{ color: tx.type === 'added' ? 'var(--red)' : 'var(--green)' }}>
                  {tx.type === 'added' ? '+' : '-'}₹{tx.amount}
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>
    </div>
  )
}