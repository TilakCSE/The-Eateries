import { useState } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import Modal from '../components/Modal'

export default function SettingsScreen() {
  const { state, dispatch } = useApp()
  const showToast = useToast()
  const [tableEdits, setTableEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  function editTable(tableId, field, value) {
    setTableEdits(e => ({ ...e, [tableId]: { ...(e[tableId] || {}), [field]: value } }))
  }

  function getVal(table, field) {
    return tableEdits[table.id]?.[field] ?? table[field]
  }

  async function saveTableSettings() {
    setSaving(true)
    try {
      for (const t of state.tables) {
        const edits = tableEdits[t.id]
        if (!edits) continue
        const updates = {}
        if (edits.name !== undefined) updates.name = edits.name
        if (edits.rate_hourly !== undefined) updates.rate_hourly = parseFloat(edits.rate_hourly) || t.rate_hourly
        if (edits.rate_frame !== undefined) updates.rate_frame = parseFloat(edits.rate_frame) || t.rate_frame
        if (edits.rate_per_player !== undefined) updates.rate_per_player = parseFloat(edits.rate_per_player) || t.rate_per_player
        if (Object.keys(updates).length === 0) continue
        await supabase.from('tables').update(updates).eq('id', t.id)
        dispatch({ type: 'UPDATE_TABLE', table: { ...t, ...updates } })
      }
      setTableEdits({})
      showToast('Settings saved', 'success')
    } catch (e) {
      showToast('Error saving', 'error')
    }
    setSaving(false)
  }

  async function savePin() {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      showToast('PIN must be 4 digits', 'error'); return
    }
    if (newPin !== confirmPin) { showToast("PINs don't match", 'error'); return }
    await supabase.from('settings').upsert({ key: 'pin', value: newPin })
    setShowPinModal(false)
    setNewPin(''); setConfirmPin('')
    showToast('PIN updated', 'success')
  }

  const hasEdits = Object.keys(tableEdits).length > 0

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar-title">Settings</div>
        {hasEdits && (
          <button
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: 13 }}
            onClick={saveTableSettings}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      <div className="scroll-area">
        {/* Admin */}
        <div className="settings-section">
          <div className="settings-section-title">Admin</div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Admin PIN</div>
              <div className="settings-row-sub">4-digit PIN to unlock the app</div>
            </div>
            <button className="settings-edit-btn" onClick={() => setShowPinModal(true)}>Change</button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Sign Out</div>
              <div className="settings-row-sub">Returns to PIN screen</div>
            </div>
            <button className="settings-edit-btn" onClick={() => {
              if (window.confirm('Sign out?')) window.location.reload()
            }}>Sign Out</button>
          </div>
        </div>

        {/* Tables */}
        <div className="settings-section">
          <div className="settings-section-title">Table Rates</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            Changes apply to new sessions only.
          </div>
          {state.tables.map(t => (
            <div key={t.id} className="table-config">
              <div className="table-config-head">
                <div className="table-config-name">{t.name}</div>
                <span className={`badge badge-${t.type}`}>{t.type}</span>
              </div>
              {[
                { field: 'name', label: 'Table name', type: 'text' },
                { field: 'rate_hourly', label: 'Hourly rate (₹)', type: 'number' },
                { field: 'rate_frame', label: 'Per frame (₹)', type: 'number' },
                { field: 'rate_per_player', label: 'Per extra player (₹)', type: 'number' },
              ].map(({ field, label, type }) => (
                <div key={field} className="config-row">
                  <div className="config-label">{label}</div>
                  <input
                    className="config-input"
                    type={type}
                    value={getVal(t, field)}
                    onChange={e => editTable(t.id, field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="settings-section">
          <div className="settings-section-title">Data</div>
          <div className="settings-row">
            <div className="settings-row-label">Saved players</div>
            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 14 }}>{state.customers.length}</div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Active sessions</div>
            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 14 }}>
              {Object.keys(state.activeSessions).length}
            </div>
          </div>
        </div>
      </div>

      {/* PIN Modal */}
      <Modal open={showPinModal} onClose={() => setShowPinModal(false)}>
        <div className="modal-title">Change PIN</div>
        <div className="modal-sub">Enter a new 4-digit admin PIN</div>
        <div className="form-group">
          <label className="form-label">New PIN</label>
          <input
            className="form-input mono"
            type="password"
            maxLength={4}
            placeholder="••••"
            style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
            value={newPin}
            onChange={e => setNewPin(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm PIN</label>
          <input
            className="form-input mono"
            type="password"
            maxLength={4}
            placeholder="••••"
            style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-full" onClick={savePin}>Update PIN</button>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-full" onClick={() => setShowPinModal(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}
