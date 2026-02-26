const API = "http://localhost:5000/api";

// ── Part 1: currentUser, login(), updateBalance() ──
// ── Part 3: loadHistory() (renders refund button state) ──
// ── Part 5: showTab(), showToast() ──

// ════════════════════════════════════════════
// ── PART 4: REFUND MODAL & SUBMISSION ───────
// ════════════════════════════════════════════

let refundTargetPaymentId = null;

function openRefundModal(paymentId, amount, receiverName) {
  refundTargetPaymentId = paymentId;
  document.getElementById("refundModalPayId").textContent    = paymentId;
  document.getElementById("refundModalAmount").textContent   = `₹${amount.toLocaleString()}`;
  document.getElementById("refundModalReceiver").textContent = receiverName;
  document.getElementById("refundPinInput").value            = "";
  document.getElementById("refundError").classList.remove("show");
  document.getElementById("refundModal").classList.add("show");
}

function closeRefundModal() {
  document.getElementById("refundModal").classList.remove("show");
  refundTargetPaymentId = null;
}

async function submitRefundRequest() {
  const pin   = document.getElementById("refundPinInput").value.trim();
  const errEl = document.getElementById("refundError");
  const btn   = document.getElementById("refundSubmitBtn");

  errEl.classList.remove("show");
  if (!pin) { errEl.textContent = "Please enter your PIN to confirm"; errEl.classList.add("show"); return; }

  btn.innerHTML = '<span class="spinner"></span>Sending...';
  btn.disabled  = true;

  try {
    const res  = await fetch(`${API}/refund/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: refundTargetPaymentId, requesterId: currentUser.id, pin }),
    });
    const data = await res.json();

    if (data.success) {
      closeRefundModal();
      showToast("Refund request sent! Awaiting receiver approval. 📨", "success");
      loadHistory();
    } else {
      errEl.textContent = data.message;
      errEl.classList.add("show");
    }
  } catch (e) {
    errEl.textContent = "Connection error.";
    errEl.classList.add("show");
  }

  btn.innerHTML = "Send Refund Request";
  btn.disabled  = false;
}

// ════════════════════════════════════════════
// ── PART 4: REFUNDS TAB ──────────────────────
// ════════════════════════════════════════════

async function loadRefunds() {
  if (!currentUser) return;
  const pendingEl = document.getElementById("pendingRefundsContainer");
  const myEl      = document.getElementById("myRefundsContainer");
  pendingEl.innerHTML = '<p style="color:var(--muted);font-size:0.875rem;">Loading...</p>';
  myEl.innerHTML      = '<p style="color:var(--muted);font-size:0.875rem;">Loading...</p>';

  try {
    const res  = await fetch(`${API}/refund/all/${currentUser.id}`);
    const data = await res.json();

    const pending = data.refunds.filter(r => r.role === "TO_APPROVE" && r.status === "PENDING");
    const mine    = data.refunds.filter(r => r.role === "REQUESTED");

    // ── Pending approvals (I need to act) ──
    if (pending.length === 0) {
      pendingEl.innerHTML = '<p style="color:var(--muted);font-size:0.875rem;">No pending refund requests to approve.</p>';
    } else {
      pendingEl.innerHTML = pending.map(r => `
        <div class="refund-card">
          <div class="refund-card-info">
            <div class="refund-card-row"><span class="key">Refund ID</span>  <span class="mono" style="font-size:0.78rem;color:var(--accent2)">${r.refundId}</span></div>
            <div class="refund-card-row"><span class="key">From</span>       <span><strong>${r.requesterName}</strong> (${r.requesterId})</span></div>
            <div class="refund-card-row"><span class="key">Payment ID</span> <span class="mono" style="font-size:0.78rem">${r.paymentId}</span></div>
            <div class="refund-card-row"><span class="key">Amount</span>     <span style="color:var(--yellow);font-weight:700">₹${r.amount.toLocaleString()}</span></div>
            <div class="refund-card-row"><span class="key">Requested</span>  <span style="font-size:0.78rem;color:var(--muted)">${new Date(r.createdAt).toLocaleString()}</span></div>
          </div>
          <div class="refund-actions">
            <div class="field" style="margin-bottom:10px">
              <label style="font-size:0.72rem">Your PIN to confirm</label>
              <input type="password" id="pin-${r.refundId}" placeholder="••••" maxlength="6" style="padding:8px 12px;font-size:0.85rem"/>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn-accept" onclick="actionRefund('${r.refundId}','ACCEPT')">✓ Accept</button>
              <button class="btn-reject" onclick="actionRefund('${r.refundId}','REJECT')">✗ Reject</button>
            </div>
          </div>
        </div>
      `).join("");
    }

    // ── My sent refund requests ──
    if (mine.length === 0) {
      myEl.innerHTML = '<p style="color:var(--muted);font-size:0.875rem;">You have not requested any refunds yet.</p>';
    } else {
      myEl.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Refund ID</th><th>Payment ID</th><th>To</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${mine.map(r => `<tr>
              <td class="mono" style="font-size:0.75rem;color:var(--accent2)">${r.refundId}</td>
              <td class="mono" style="font-size:0.75rem">${r.paymentId}</td>
              <td style="font-size:0.8rem"><strong>${r.receiverName}</strong></td>
              <td style="color:var(--yellow);font-weight:600">₹${r.amount.toLocaleString()}</td>
              <td><span class="badge refund-${r.status}">${r.status}</span></td>
              <td style="font-size:0.78rem;color:var(--muted)">${new Date(r.createdAt).toLocaleString()}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>`;
    }

    updateRefundBadge(pending.length);
  } catch (e) {
    pendingEl.innerHTML = '<p style="color:var(--red);font-size:0.875rem;">Failed to load. Check backend.</p>';
    myEl.innerHTML = "";
  }
}

async function actionRefund(refundId, action) {
  const pinInput = document.getElementById(`pin-${refundId}`);
  const pin = pinInput ? pinInput.value.trim() : "";
  if (!pin) { showToast("Please enter your PIN to confirm", "error"); return; }

  try {
    const res  = await fetch(`${API}/refund/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refundId, userId: currentUser.id, pin, action }),
    });
    const data = await res.json();

    if (data.success) {
      const msg = action === "ACCEPT" ? "✅ Refund accepted! Amount transferred back." : "❌ Refund request rejected.";
      showToast(msg, action === "ACCEPT" ? "success" : "error");
      updateBalance();
      loadRefunds();
    } else {
      showToast(data.message, "error");
    }
  } catch (e) { showToast("Connection error.", "error"); }
}

async function checkPendingRefundsBadge() {
  try {
    const res  = await fetch(`${API}/refund/pending/${currentUser.id}`);
    const data = await res.json();
    updateRefundBadge(data.refunds ? data.refunds.length : 0);
  } catch (e) {}
}

function updateRefundBadge(count) {
  const badge = document.getElementById("refundNavBadge");
  if (!badge) return;
  badge.textContent   = count;
  badge.style.display = count > 0 ? "inline-flex" : "none";
}
