import { useState, useEffect } from "react";
import Modal from "./Modal";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/store";
import { useToast } from "../lib/toast";
import { formatTime } from "../lib/billing";

export default function CheckoutModal({
  table,
  session,
  elapsedSeconds,
  open,
  onClose,
  onDone,
}) {
  const { state, dispatch, refreshCustomers } = useApp();
  const showToast = useToast();
  const [amount, setAmount] = useState("");
  const [splitType, setSplitType] = useState("one");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [playerAmounts, setPlayerAmounts] = useState({});
  const [playerToBalance, setPlayerToBalance] = useState({});
  const [loading, setLoading] = useState(false);

  const players = session?.session_players || [];

  useEffect(() => {
    if (!open || !session) return;
    setAmount("");
    setSplitType("one");
    setPaymentMethod("cash");
    initPlayerSplits();
  }, [open, session?.id]);

  function initPlayerSplits() {
    const pa = {};
    const pb = {};
    players.forEach((_, i) => {
      pa[i] = "";
      pb[i] = "";
    });
    setPlayerAmounts(pa);
    setPlayerToBalance(pb);
  }

  const total = parseFloat(amount) || 0;

  useEffect(() => {
    if (!total || players.length === 0) return;
    if (splitType === "equal") {
      const each = (total / players.length).toFixed(0);
      const pa = {};
      players.forEach((_, i) => {
        pa[i] = each;
      });
      setPlayerAmounts(pa);
      setPlayerToBalance(
        players.reduce((acc, _, i) => ({ ...acc, [i]: "" }), {}),
      );
    } else if (splitType === "one") {
      // Clear out inputs and wait for admin to click an assignment button
      const pa = {};
      players.forEach((_, i) => {
        pa[i] = "0";
      });
      setPlayerAmounts(pa);
      setPlayerToBalance(
        players.reduce((acc, _, i) => ({ ...acc, [i]: "0" }), {}),
      );
    }
  }, [splitType, total]);

  function updatePlayerAmount(idx, val) {
    setPlayerAmounts((p) => ({ ...p, [idx]: val }));
  }
  function updatePlayerBalance(idx, val) {
    setPlayerToBalance((p) => ({ ...p, [idx]: val }));
  }

  const totalAssigned = Object.values(playerAmounts).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0,
  );
  const totalToBalance = Object.values(playerToBalance).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0,
  );
  const assignedOk = Math.abs(totalAssigned + totalToBalance - total) < 1;

  async function confirmCheckout() {
    if (!total || total <= 0) {
      showToast("Enter the amount to charge", "error");
      return;
    }
    if (
      players.length > 1 &&
      (splitType === "custom" || splitType === "one") &&
      !assignedOk
    ) {
      showToast(`Amounts must add up to ₹${total}`, "error");
      return;
    }
    setLoading(true);
    try {
      const playerUpdates = players.map((p, i) => {
        const paid = parseFloat(playerAmounts[i]) || 0;
        const addedToBalance = parseFloat(playerToBalance[i]) || 0;
        return { ...p, amount_paid: paid, balance_added: addedToBalance };
      });

      await supabase
        .from("sessions")
        .update({
          status: "completed",
          end_time: new Date().toISOString(),
          elapsed_seconds: elapsedSeconds,
          total_charge: total,
          payment_method: paymentMethod,
          split_type: splitType,
        })
        .eq("id", session.id);

      for (const p of playerUpdates) {
        if (p.id) {
          await supabase
            .from("session_players")
            .update({
              amount_paid: p.amount_paid,
              balance_added: p.balance_added,
            })
            .eq("id", p.id);
        }
      }

      for (const p of playerUpdates) {
        if (!p.customer_id) continue;
        const c = state.customers.find((x) => x.id === p.customer_id);
        if (!c) continue;

        const newBalance = (c.pending_balance || 0) + p.balance_added;
        await supabase
          .from("customers")
          .update({
            visits: (c.visits || 0) + 1,
            total_spent: (c.total_spent || 0) + p.amount_paid,
            total_hours: (c.total_hours || 0) + elapsedSeconds / 3600,
            total_frames: (c.total_frames || 0) + (session.frames || 0),
            last_seen: new Date().toISOString(),
            pending_balance: newBalance,
          })
          .eq("id", p.customer_id);

        if (p.balance_added > 0) {
          await supabase.from("balance_transactions").insert({
            customer_id: p.customer_id,
            session_id: session.id,
            amount: p.balance_added,
            type: "added",
            note: `Added from session on ${session.table_name}`,
          });
        }
      }

      await supabase
        .from("tables")
        .update({ status: "free", session_id: null })
        .eq("id", table.id);
      dispatch({ type: "REMOVE_SESSION", tableId: table.id });
      dispatch({
        type: "SET_TABLE_STATUS",
        tableId: table.id,
        status: "free",
        sessionId: null,
      });
      await refreshCustomers();

      showToast("Payment confirmed · ₹" + total, "success");
      onClose();
      if (onDone) onDone();
    } catch (e) {
      showToast("Error completing checkout", "error");
      console.error(e);
    }
    setLoading(false);
  }

  if (!session) return null;

  const isMultiPlayer = players.length > 1;
  const sessionMode =
    session.billing_mode === "frame"
      ? `${session.frames} frames`
      : formatTime(elapsedSeconds || 0);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-title">Checkout</div>
      <div className="modal-sub">
        {table?.name} · {sessionMode}
      </div>

      <div className="summary-block">
        <div className="summary-row">
          <span className="summary-row-label">Table</span>
          <span className="summary-row-value">{session.table_name}</span>
        </div>
        <div className="summary-row">
          <span className="summary-row-label">Duration</span>
          <span className="summary-row-value">
            {formatTime(elapsedSeconds || 0)}
          </span>
        </div>
        <div className="summary-row">
          <span className="summary-row-label">Mode</span>
          <span className="summary-row-value">
            {session.billing_mode === "frame"
              ? session.frames + " frames"
              : "Hourly"}
          </span>
        </div>
        <div
          className="summary-row"
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "12px 0",
          }}
        >
          <span
            className="summary-row-label"
            style={{ marginBottom: 8, fontSize: "0.9rem" }}
          >
            Players
          </span>
          <div
            className="summary-row-value"
            style={{
              textAlign: "left",
              lineHeight: "1.6",
              fontSize: "1.15rem",
              color: "var(--text)",
            }}
          >
            {players.map((p, idx) => (
              <div key={idx} style={{ paddingBottom: 4 }}>
                <span style={{ color: "var(--text3)", marginRight: 8 }}>
                  {idx + 1}.
                </span>
                {p.player_name}
              </div>
            ))}
          </div>
        </div>
        <div className="summary-row">
          <span className="summary-row-label">Ref rate</span>
          <span className="summary-row-value">
            ₹{table?.rate_hourly}/hr · ₹{table?.rate_frame}/fr
          </span>
        </div>
      </div>

      <div className="amount-input-block">
        <label className="form-label">Total Amount to Charge</label>
        <input
          className="amount-input-big"
          type="number"
          placeholder="₹ 0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
        />
        <div className="amount-hint">
          {table &&
            `Suggested: ₹${Math.ceil((elapsedSeconds / 3600) * table.rate_hourly)} (hourly)`}
          {session.billing_mode === "frame" &&
            table &&
            ` · ₹${session.frames * table.rate_frame} (frames)`}
        </div>
      </div>

      {isMultiPlayer && (
        <div className="form-group">
          <label className="form-label">How to split?</label>
          <div className="pill-group" style={{ marginBottom: 14 }}>
            {[
              ["one", "One Pays"],
              ["equal", "Equal Split"],
              ["custom", "Custom"],
            ].map(([t, label]) => (
              <div
                key={t}
                className={`pill${splitType === t ? " selected" : ""}`}
                onClick={() => setSplitType(t)}
              >
                {label}
              </div>
            ))}
          </div>

          {/* ONE PAYS: Rapid Action Buttons */}
          {splitType === "one" && (
            <div className="summary-block">
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text3)",
                  marginBottom: 10,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                Select who takes the full bill
              </div>
              {players.map((p, i) => {
                const existingBal = p.customer_id
                  ? state.customers.find((c) => c.id === p.customer_id)
                      ?.pending_balance || 0
                  : 0;
                const isAssignedPaid =
                  parseFloat(playerAmounts[i]) === total && total > 0;
                const isAssignedBal =
                  parseFloat(playerToBalance[i]) === total && total > 0;

                return (
                  <div
                    key={i}
                    className="balance-assign-row"
                    style={{ alignItems: "center", paddingBottom: 12 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        className="bal-player-name"
                        style={{ fontSize: "1.1rem", fontWeight: 500 }}
                      >
                        {p.player_name}
                      </div>
                      {/* REMOVED the existingBal > 0 check completely */}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className={`btn ${isAssignedPaid && paymentMethod === "cash" ? "btn-primary" : "btn-ghost"}`}
                        style={{
                          padding: "6px 12px",
                          fontSize: 13,
                          height: "auto",
                          minHeight: "32px",
                        }}
                        disabled={!total}
                        onClick={() => {
                          const pa = {};
                          const pb = {};
                          players.forEach((_, idx) => {
                            pa[idx] = idx === i ? String(total) : "0";
                            pb[idx] = "0";
                          });
                          setPlayerAmounts(pa);
                          setPlayerToBalance(pb);
                          setPaymentMethod("cash");
                        }}
                      >
                        💵 Cash
                      </button>
                      <button
                        className={`btn ${isAssignedPaid && paymentMethod === "upi" ? "btn-primary" : "btn-ghost"}`}
                        style={{
                          padding: "6px 12px",
                          fontSize: 13,
                          height: "auto",
                          minHeight: "32px",
                        }}
                        disabled={!total}
                        onClick={() => {
                          const pa = {};
                          const pb = {};
                          players.forEach((_, idx) => {
                            pa[idx] = idx === i ? String(total) : "0";
                            pb[idx] = "0";
                          });
                          setPlayerAmounts(pa);
                          setPlayerToBalance(pb);
                          setPaymentMethod("upi");
                        }}
                      >
                        📱 UPI
                      </button>
                      <button
                        className={`btn ${isAssignedBal ? "btn-primary" : "btn-ghost"}`}
                        style={{
                          padding: "6px 12px",
                          fontSize: 13,
                          height: "auto",
                          minHeight: "32px",
                        }}
                        disabled={!total}
                        onClick={() => {
                          const pa = {};
                          const pb = {};
                          players.forEach((_, idx) => {
                            pa[idx] = "0";
                            pb[idx] = idx === i ? String(total) : "0";
                          });
                          setPlayerAmounts(pa);
                          setPlayerToBalance(pb);
                        }}
                      >
                        + Bal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* EQUAL or CUSTOM: Manual Inputs */}
          {(splitType === "custom" || splitType === "equal") && (
            <div className="summary-block">
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text3)",
                  marginBottom: 10,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                Paid now · Added to balance
              </div>
              {players.map((p, i) => {
                const existingBal = p.customer_id
                  ? state.customers.find((c) => c.id === p.customer_id)
                      ?.pending_balance || 0
                  : 0;
                return (
                  <div key={i} className="balance-assign-row">
                    <div style={{ flex: 1 }}>
                      <div className="bal-player-name">{p.player_name}</div>
                      {existingBal > 0 && (
                        <div className="bal-existing">Owes ₹{existingBal}</div>
                      )}
                    </div>
                    <input
                      className="bal-input"
                      type="number"
                      placeholder="Paid"
                      value={playerAmounts[i] ?? ""}
                      onChange={(e) => updatePlayerAmount(i, e.target.value)}
                      min="0"
                      disabled={splitType === "equal"}
                      style={{ opacity: splitType === "custom" ? 1 : 0.6 }}
                    />
                    <input
                      className="bal-input"
                      type="number"
                      placeholder="+ Bal"
                      value={playerToBalance[i] ?? ""}
                      onChange={(e) => updatePlayerBalance(i, e.target.value)}
                      min="0"
                    />
                  </div>
                );
              })}
              {splitType === "custom" && total > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--mono)",
                    marginTop: 10,
                    color: assignedOk ? "var(--green)" : "var(--red)",
                  }}
                >
                  {assignedOk
                    ? "✓ Amounts balance"
                    : `Remaining: ₹${(total - totalAssigned - totalToBalance).toFixed(0)}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isMultiPlayer && players[0] && (
        <div className="form-group">
          <div className="summary-block" style={{ marginBottom: 0 }}>
            <div className="balance-assign-row" style={{ paddingTop: 0 }}>
              <div style={{ flex: 1 }}>
                <div className="bal-player-name">{players[0].player_name}</div>
                {players[0].customer_id &&
                  (() => {
                    const bal =
                      state.customers.find(
                        (c) => c.id === players[0].customer_id,
                      )?.pending_balance || 0;
                    return bal > 0 ? (
                      <div className="bal-existing">
                        Existing balance: ₹{bal}
                      </div>
                    ) : null;
                  })()}
              </div>
              <input
                className="bal-input"
                type="number"
                placeholder="Paid"
                value={playerAmounts[0] ?? ""}
                onChange={(e) => updatePlayerAmount(0, e.target.value)}
                min="0"
              />
              <input
                className="bal-input"
                type="number"
                placeholder="+ Bal"
                value={playerToBalance[0] ?? ""}
                onChange={(e) => updatePlayerBalance(0, e.target.value)}
                min="0"
              />
            </div>
          </div>
          <div className="form-hint">
            Left column: paid now. Right column: add to their pending balance.
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">
          Payment Method (For "Paid Now" amounts)
        </label>
        <div className="pm-grid">
          {[
            ["cash", "💵  Cash"],
            ["upi", "📱  UPI"],
          ].map(([m, label]) => (
            <button
              key={m}
              className={`pm-btn${paymentMethod === m ? " selected" : ""}`}
              onClick={() => setPaymentMethod(m)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary btn-full"
        onClick={confirmCheckout}
        disabled={loading || !amount}
      >
        {loading ? "Processing..." : `Confirm Payment · ₹${total || 0}`}
      </button>
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-full" onClick={onClose}>
          Back
        </button>
      </div>
    </Modal>
  );
}
