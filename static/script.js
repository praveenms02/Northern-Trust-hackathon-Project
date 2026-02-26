const API = "http://localhost:5000/api";

// ── Part 1: currentUser, login(), logout(), updateBalance() ──
// ── Part 2: initiatePayment(), pollPayment(), closeModal() ──
// ── Part 5: showTab(), showToast() ──

// ════════════════════════════════════════════════════
// ── PART 3: HISTORY & STATUS ─────────────────────────
// ════════════════════════════════════════════════════

let refundTimerInterval = null; // live countdown handle

async function loadHistory() {
  if (!currentUser) return;
  const tbody = document.getElementById("historyBody");
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">Loading...</td></tr>';

  try {
    const res  = await fetch(`${API}/payments/user/${currentUser.id}`);
    const data = await res.json();

    if (!data.payments || data.payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">No transactions yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.payments.map(p => {
      const party = p.type === "SENT"
        ? `To: <strong>${p.receiverName}</strong> (${p.receiverId})`
        : `From: <strong>${p.senderName}</strong> (${p.senderId})`;
      const amt = p.type === "SENT"
        ? `<span style="color:var(--red)">- ₹${p.amount.toLocaleString()}</span>`
        : `<span style="color:var(--green)">+ ₹${p.amount.toLocaleString()}</span>`;
      const time = new Date(p.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

      const REFUND_WINDOW_MS = 10 * 60 * 1000;
      const timeLeft = REFUND_WINDOW_MS - (Date.now() - new Date(p.createdAt).getTime());
      const rs       = p.refundStatus || "none";

      let refundBtn;
      if (p.type === "SENT" && p.status === "SUCCESS") {
        if      (rs === "accepted") refundBtn = `<span class="refund-done refund-accepted" title="Refund accepted">✅ Refunded</span>`;
        else if (rs === "rejected") refundBtn = `<span class="refund-done refund-rejected" title="Refund rejected">❌ Rejected</span>`;
        else if (rs === "pending")  refundBtn = `<span class="refund-done refund-pending"  title="Awaiting approval">⏳ Pending</span>`;
        else if (timeLeft > 0) {
          const mins = Math.floor(timeLeft / 60000);
          const secs = Math.floor((timeLeft % 60000) / 1000);
          refundBtn = `<button class="btn-refund" onclick="openRefundModal('${p.paymentId}',${p.amount},'${p.receiverName}')" id="rfbtn-${p.paymentId}">↩ Refund <span class="refund-timer" id="timer-${p.paymentId}">${mins}:${String(secs).padStart(2,"0")}</span></button>`;
        } else {
          refundBtn = `<span class="refund-expired" title="Window expired">↩ Expired</span>`;
        }
      } else {
        refundBtn = "—";
      }

      return `<tr>
        <td class="mono" style="font-size:0.75rem;color:var(--accent2)">${p.paymentId}</td>
        <td><span class="type-badge ${p.type}">${p.type}</span></td>
        <td style="font-size:0.8rem;">${party}</td>
        <td>${amt}</td>
        <td><span class="badge ${p.status}">${p.status}</span></td>
        <td style="font-size:0.78rem;color:var(--muted)">${time}</td>
        <td>${refundBtn}</td>
      </tr>`;
    }).join("");

    // Live countdown — ticks every second, replaces button with "Expired" at zero
    if (refundTimerInterval) clearInterval(refundTimerInterval);
    refundTimerInterval = setInterval(() => {
      const WINDOW = 10 * 60 * 1000;
      data.payments.forEach(p => {
        if (p.type !== "SENT" || p.status !== "SUCCESS") return;
        if ((p.refundStatus || "none") !== "none") return;
        const timerEl = document.getElementById(`timer-${p.paymentId}`);
        const btnEl   = document.getElementById(`rfbtn-${p.paymentId}`);
        if (!timerEl || !btnEl) return;
        const left = WINDOW - (Date.now() - new Date(p.createdAt).getTime());
        if (left <= 0) {
          const exp = document.createElement("span");
          exp.className = "refund-expired";
          exp.title     = "Refund window expired (10 min)";
          exp.textContent = "↩ Expired";
          btnEl.replaceWith(exp);
        } else {
          const m = Math.floor(left / 60000);
          const s = Math.floor((left % 60000) / 1000);
          timerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
        }
      });
    }, 1000);

  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:20px;">Failed to load. Check backend.</td></tr>';
  }
}

async function checkStatus() {
  const payId  = document.getElementById("checkPayId").value.trim().toUpperCase();
  const result = document.getElementById("statusResult");
  const card   = document.getElementById("statusCard");

  if (!payId) return;
  card.innerHTML      = '<p style="color:var(--muted)">Fetching...</p>';
  result.style.display = "block";

  try {
    const res  = await fetch(`${API}/payment/${payId}`);
    const data = await res.json();

    if (!data.success) { card.innerHTML = `<p style="color:var(--red)">${data.message}</p>`; return; }

    const rows = [
      ["Payment ID",   `<span class="mono">${data.paymentId}</span>`],
      ["Status",       `<span class="badge ${data.status}">${data.status}</span>`],
      ["Sender",       `${data.senderName} <span class="mono" style="color:var(--muted);font-size:0.75rem">(${data.senderId})</span>`],
      ["Receiver",     `${data.receiverName} <span class="mono" style="color:var(--muted);font-size:0.75rem">(${data.receiverId})</span>`],
      ["Amount",       `<strong>₹ ${data.amount.toLocaleString()}</strong> ${data.currency}`],
      ["Created",      new Date(data.createdAt).toLocaleString()],
      ["Updated",      new Date(data.updatedAt).toLocaleString()],
    ];
    if (data.failureReason) rows.push(["Failure Reason", `<span style="color:var(--red)">${data.failureReason}</span>`]);

    card.innerHTML = rows.map(([k, v]) =>
      `<div class="status-row"><span class="key">${k}</span><span class="val">${v}</span></div>`
    ).join("");
  } catch (e) {
    card.innerHTML = `<p style="color:var(--red)">Connection error.</p>`;
  }
}