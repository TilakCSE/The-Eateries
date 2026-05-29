import { useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import Modal from '../components/Modal'
import { formatDateTime } from '../lib/billing'

export default function BalancesScreen() {
  const { state, dispatch, refreshCustomers } = useApp()
  const showToast = useToast()
  
  // Settle states
  const [settling, setSettling] = useState(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [settleMethod, setSettleMethod] = useState('cash')
  
  // Manual charge states
  const [addingCharge, setAddingCharge] = useState(null)
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeNote, setChargeNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [txHistory, setTxHistory] = useState([])
  const [showHistory, setShowHistory] = useState(null)

  const withBalance = state.customers
    .filter(c => c.pending_balance > 0)
    .sort((a, b) => b.pending_balance - a.pending_balance)

  const totalOwed = withBalance.reduce((s, c) => s + c.pending_balance, 0)

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
      const newTotalSpent = (settling.total_spent || 0) + amt // FIX: Add to total spent when settling debt
      
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
        {withBalance.length === 0 ? (
          <div className="empty">
            <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p>No pending balances.<br />All players are settled up.</p>
          </div>
        ) : (
          <>
            <div className="section-label" style={{ marginBottom: 12 }}>
              {withBalance.length} player{withBalance.length > 1 ? 's' : ''} with pending balance
            </div>

            {withBalance.map(c => (
              <div key={c.id} className="balance-row" style={{ padding: '16px 12px' }}> {/* Increased touch target */}
                <div className="player-avatar" style={{ width: 44, height: 44, fontSize: 16 }}> {/* Bigger avatar */}
                  {c.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  {/* FIX: Swapped break-word for nowrap and textOverflow ellipsis to prevent vertical glitch */}
                  <div style={{ fontSize: '1.15rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
                    {c.phone || 'No phone'} · {c.visits || 0} visits
                  </div>
                </div>
                <div className="balance-amount" style={{ fontSize: '1.2rem' }}>₹{c.pending_balance}</div>
                <button className="settle-btn" style={{ marginLeft: 8 }} onClick={() => openSettle(c)}>
                  Settle
                </button>
                <button className="settle-btn" style={{ marginLeft: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }} onClick={() => openAddCharge(c)}>
                  + Charge
                </button>
                <button className="icon-btn" style={{ marginLeft: 6 }} title="View history" onClick={() => openHistory(c)}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            ))}
          </>
        )}

        {/* All players with zero balance */}
        {state.customers.filter(c => c.pending_balance === 0).length > 0 && (
          <>
            <hr className="divider" />
            <div className="section-label" style={{ marginBottom: 10 }}>Settled players</div>
            {state.customers.filter(c => !c.pending_balance || c.pending_balance === 0).map(c => (
              <div key={c.id} className="balance-row" style={{ opacity: 0.5 }}>
                <div className="player-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                  {c.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.phone || 'No phone'}</div>
                </div>
                <button className="settle-btn" style={{ marginRight: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }} onClick={() => openAddCharge(c)}>
                  + Charge
                </button>
                <button className="icon-btn" style={{ marginRight: 10 }} title="View history" onClick={() => openHistory(c)}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <div style={{ fontSize: 13, color: 'var(--green)', fontFamily: 'var(--mono)' }}>✓ Clear</div>
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
              <input
                className="amount-input-big" type="number" value={settleAmount}
                onChange={e => setSettleAmount(e.target.value)} max={settling.pending_balance} min="1"
              />
              <div className="amount-hint">Full balance: ₹{settling.pending_balance}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <div className="pm-grid">
                {[['cash','💵  Cash'], ['upi','📱  UPI']].map(([m, label]) => (
                  <button key={m} className={`pm-btn${settleMethod === m ? ' selected' : ''}`} onClick={() => setSettleMethod(m)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={confirmSettle} disabled={loading}>
              {loading ? 'Processing...' : `Collect ₹${settleAmount || 0}`}
            </button>
            <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-full" onClick={() => setSettling(null)}>Cancel</button></div>
          </>
        )}
      </Modal>

      {/* Manual Add Charge Modal */}
      <Modal open={!!addingCharge} onClose={() => setAddingCharge(null)}>
        {addingCharge && (
          <>
            <div className="modal-title">Add Manual Charge</div>
            <div className="modal-sub">Add debt to {addingCharge.name}'s balance</div>

            <div className="form-group">
              <label className="form-label">Amount to add</label>
              <input
                className="amount-input-big" type="number" placeholder="₹ 0"
                value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} min="1"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Reason / Note (Optional)</label>
              <input
                style={{ width: '100%', padding: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)' }}
                type="text" placeholder="e.g. Fine, Snacks, Past due..."
                value={chargeNote} onChange={e => setChargeNote(e.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-full" onClick={confirmAddCharge} disabled={loading || !chargeAmount}>
              {loading ? 'Processing...' : `Add ₹${chargeAmount || 0} to Balance`}
            </button>
            <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-full" onClick={() => setAddingCharge(null)}>Cancel</button></div>
          </>
        )}
      </Modal>

      {/* Balance History Modal */}
      <Modal open={!!showHistory} onClose={() => setShowHistory(null)}>
        {showHistory && (
          <>
            <div className="modal-title">{showHistory.name}</div>
            <div className="modal-sub">Balance history</div>
            {txHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No transactions yet.</div>
            ) : txHistory.map(tx => (
              <div key={tx.id} className="history-row">
                <div className="history-date">
                  {/* FIX: Replaced simple Date with the precise format string */}
                  {formatDateTime(tx.created_at)} 
                </div>
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