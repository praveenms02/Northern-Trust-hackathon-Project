// PayFlow — Frontend JavaScript (fully assembled)
const API = "http://localhost:5000/api";

// ══════════════════════════════════════════════════
// PART 1 — AUTH: globals, login, logout, balance
// ══════════════════════════════════════════════════

let currentUser = null;
let allUsers = [];
let lastPaymentDetails = null; // Part 2: stores last failed payment for retry
let refundTimerInterval = null; // Part 3: live countdown handle

async function login() {
  const userId = document
    .getElementById("loginUserId")
    .value.trim()
    .toUpperCase();
  const pin = document.getElementById("loginPin").value.trim();
  const errEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  errEl.classList.remove("show");
  btn.innerHTML = '<span class="spinner"></span>Verifying...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    });
    const data = await res.json();

    if (data.success) {
      currentUser = {
        id: data.userId,
        name: data.name,
        balance: data.balance,
        pin,
      };
      document.getElementById("headerUserName").textContent = data.name;
      document.getElementById("sidebarBalance").textContent =
        "₹ " + data.balance.toLocaleString("en-IN");
      showPage("dashboard");
      loadAllUsers();
      loadHistory();
      checkPendingRefundsBadge();
    } else {
      errEl.textContent = data.message;
      errEl.classList.add("show");
    }
  } catch (e) {
    errEl.textContent =
      "Cannot connect to server. Make sure backend is running on port 5000.";
    errEl.classList.add("show");
  }

  btn.innerHTML = "Login & Verify";
  btn.disabled = false;
}

function logout() {
  currentUser = null;
  lastPaymentDetails = null;
  if (refundTimerInterval) {
    clearInterval(refundTimerInterval);
    refundTimerInterval = null;
  }
  document.getElementById("loginUserId").value = "";
  document.getElementById("loginPin").value = "";
  document.getElementById("loginError").classList.remove("show");
  showPage("loginPage");
}

function showPage(id) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

async function loadAllUsers() {
  try {
    const res = await fetch(`${API}/users`);
    const data = await res.json();
    allUsers = data.users || [];
  } catch (e) {}
}

function lookupReceiver() {
  const id = document.getElementById("receiverId").value.trim().toUpperCase();
  const card = document.getElementById("receiverCard");
  const user = allUsers.find((u) => u.id === id);

  if (user && user.id !== currentUser.id) {
    document.getElementById("receiverAv").textContent = user.name[0];
    document.getElementById("receiverName").textContent = user.name;
    document.getElementById("receiverIdLabel").textContent = user.id;
    card.classList.add("show");
  } else {
    card.classList.remove("show");
  }
}

async function updateBalance() {
  try {
    const res = await fetch(`${API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, pin: currentUser.pin }),
    });
    const data = await res.json();
    if (data.success) {
      currentUser.balance = data.balance;
      document.getElementById("sidebarBalance").textContent =
        "₹ " + data.balance.toLocaleString("en-IN");
    }
  } catch (e) {}
}

// Enter key triggers login
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    document.getElementById("loginPage").classList.contains("active")
  ) {
    login();
  }
});

// ══════════════════════════════════════════════════
// PART 2 — PAYMENTS: send money, modal, polling
// ══════════════════════════════════════════════════

let pollInterval = null;

async function initiatePayment() {
  const receiverId = document
    .getElementById("receiverId")
    .value.trim()
    .toUpperCase();
  const amount = parseFloat(document.getElementById("payAmount").value);
  const pin = document.getElementById("payPin").value.trim();
  const errEl = document.getElementById("payError");
  const btn = document.getElementById("payBtn");

  errEl.classList.remove("show");

  if (!receiverId) {
    errEl.textContent = "Enter a receiver ID";
    errEl.classList.add("show");
    return;
  }
  if (!amount || amount <= 0) {
    errEl.textContent = "Enter a valid amount";
    errEl.classList.add("show");
    return;
  }
  if (!pin) {
    errEl.textContent = "Enter your UPI PIN";
    errEl.classList.add("show");
    return;
  }

  btn.innerHTML = '<span class="spinner"></span>Initiating...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: currentUser.id,
        receiverId,
        amount,
        currency: "INR",
        pin,
      }),
    });
    const data = await res.json();

    if (data.success) {
      lastPaymentDetails = { receiverId, amount }; // PIN deliberately not stored
      document.getElementById("receiverId").value = "";
      document.getElementById("payAmount").value = "";
      document.getElementById("payPin").value = "";
      document.getElementById("receiverCard").classList.remove("show");
      showPayModal(data.paymentId);
    } else {
      errEl.textContent = data.message;
      errEl.classList.add("show");
    }
  } catch (e) {
    errEl.textContent = "Connection error. Is the backend running?";
    errEl.classList.add("show");
  }

  btn.innerHTML = "Send Payment";
  btn.disabled = false;
}

// Pre-fills Send Money form so user can adjust amount and re-enter PIN
function retryPayment() {
  if (!lastPaymentDetails) return;

  const { receiverId, amount } = lastPaymentDetails;
  document.getElementById("receiverId").value = receiverId;
  document.getElementById("payAmount").value = amount;
  document.getElementById("payPin").value = "";
  document.getElementById("payError").classList.remove("show");
  lookupReceiver();
  closeModal();
  showTab("pay");

  setTimeout(() => {
    const a = document.getElementById("payAmount");
    a.focus();
    a.select();
  }, 150);

  showToast(
    "Details pre-filled — adjust amount if needed, then enter your PIN.",
    "",
  );
}

function showPayModal(paymentId) {
  document.getElementById("modalIcon").textContent = "⏳";
  document.getElementById("modalTitle").textContent = "Payment Initiated";
  document.getElementById("modalMsg").textContent =
    "Your payment is being processed by the bank...";
  document.getElementById("modalPayId").textContent = paymentId;
  document.getElementById("modalBadge").textContent = "CREATED";
  document.getElementById("modalBadge").className = "badge CREATED";
  document.getElementById("modalPoll").textContent =
    "Waiting for bank response...";
  document.getElementById("modalCloseBtn").style.display = "none";
  document.getElementById("modalRetryBtn").style.display = "none";
  document.getElementById("payModal").classList.add("show");
  pollInterval = setInterval(() => pollPayment(paymentId), 1500);
}

async function pollPayment(paymentId) {
  try {
    const res = await fetch(`${API}/payment/${paymentId}`);
    const data = await res.json();
    const badge = document.getElementById("modalBadge");
    badge.textContent = data.status;
    badge.className = "badge " + data.status;

    if (data.status === "PROCESSING") {
      document.getElementById("modalPoll").textContent =
        "Bank is processing your request...";
    }

    if (data.status === "SUCCESS") {
      clearInterval(pollInterval);
      document.getElementById("modalIcon").textContent = "✅";
      document.getElementById("modalTitle").textContent = "Payment Successful!";
      document.getElementById("modalMsg").textContent =
        `₹${data.amount.toLocaleString()} sent to ${data.receiverName}`;
      document.getElementById("modalPoll").textContent = "";
      document.getElementById("modalCloseBtn").style.display = "inline-block";
      document.getElementById("modalRetryBtn").style.display = "none";
      updateBalance();
      showToast("Payment successful! ✅", "success");
    }

    if (data.status === "FAILED") {
      clearInterval(pollInterval);
      document.getElementById("modalIcon").textContent = "❌";
      document.getElementById("modalTitle").textContent = "Payment Failed";
      document.getElementById("modalMsg").textContent =
        `Reason: ${data.failureReason || "Unknown"}`;
      document.getElementById("modalPoll").textContent =
        "Amount will not be deducted.";
      document.getElementById("modalCloseBtn").style.display = "inline-block";
      if (lastPaymentDetails) {
        document.getElementById("modalRetryBtn").style.display = "inline-block";
      }
      showToast("Payment failed: " + data.failureReason, "error");
    }
  } catch (e) {}
}

function closeModal() {
  clearInterval(pollInterval);
  document.getElementById("payModal").classList.remove("show");
}

// ══════════════════════════════════════════════════
// PART 3 — HISTORY & STATUS CHECKER
// ══════════════════════════════════════════════════

async function loadHistory() {
  if (!currentUser) return;
  const tbody = document.getElementById("historyBody");
  tbody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">Loading...</td></tr>';

  try {
    const res = await fetch(`${API}/payments/user/${currentUser.id}`);
    const data = await res.json();

    if (!data.payments || data.payments.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px;">No transactions yet. Send your first payment!</td></tr>';
      return;
    }

    tbody.innerHTML = data.payments
      .map((p) => {
        const party =
          p.type === "SENT"
            ? `To: <strong>${p.receiverName}</strong> (${p.receiverId})`
            : `From: <strong>${p.senderName}</strong> (${p.senderId})`;
        const amt =
          p.type === "SENT"
            ? `<span style="color:var(--red)">- ₹${p.amount.toLocaleString()}</span>`
            : `<span style="color:var(--green)">+ ₹${p.amount.toLocaleString()}</span>`;
        const time = new Date(p.createdAt).toLocaleString("en-IN", {
          dateStyle: "short",
          timeStyle: "short",
        });

        const REFUND_WINDOW_MS = 10 * 60 * 1000;
        const timeLeft =
          REFUND_WINDOW_MS - (Date.now() - new Date(p.createdAt).getTime());
        const rs = p.refundStatus || "none"; // 'none' | 'pending' | 'accepted' | 'rejected'

        let refundBtn;
        if (p.type === "SENT" && p.status === "SUCCESS") {
          if (rs === "accepted")
            refundBtn = `<span class="refund-done refund-accepted" title="Refund accepted">✅ Refunded</span>`;
          else if (rs === "rejected")
            refundBtn = `<span class="refund-done refund-rejected" title="Refund rejected">❌ Rejected</span>`;
          else if (rs === "pending")
            refundBtn = `<span class="refund-done refund-pending"  title="Awaiting approval">⏳ Pending</span>`;
          else if (timeLeft > 0) {
            const mins = Math.floor(timeLeft / 60000);
            const secs = Math.floor((timeLeft % 60000) / 1000);
            refundBtn = `<button class="btn-refund" onclick="openRefundModal('${p.paymentId}',${p.amount},'${p.receiverName}')" id="rfbtn-${p.paymentId}">↩ Refund <span class="refund-timer" id="timer-${p.paymentId}">${mins}:${String(secs).padStart(2, "0")}</span></button>`;
          } else {
            refundBtn = `<span class="refund-expired" title="Refund window expired (10 min)">↩ Expired</span>`;
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
      })
      .join("");

    // Live countdown — ticks every second, replaces button with "Expired" at zero
    // Skips rows where refund is already in a terminal state
    if (refundTimerInterval) clearInterval(refundTimerInterval);
    refundTimerInterval = setInterval(() => {
      const WINDOW = 10 * 60 * 1000;
      data.payments.forEach((p) => {
        if (p.type !== "SENT" || p.status !== "SUCCESS") return;
        if ((p.refundStatus || "none") !== "none") return;
        const timerEl = document.getElementById(`timer-${p.paymentId}`);
        const btnEl = document.getElementById(`rfbtn-${p.paymentId}`);
        if (!timerEl || !btnEl) return;
        const left = WINDOW - (Date.now() - new Date(p.createdAt).getTime());
        if (left <= 0) {
          const exp = document.createElement("span");
          exp.className = "refund-expired";
          exp.title = "Refund window expired (10 min)";
          exp.textContent = "↩ Expired";
          btnEl.replaceWith(exp);
        } else {
          timerEl.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
        }
      });
    }, 1000);
  } catch (e) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:20px;">Failed to load. Check backend.</td></tr>';
  }
}

async function checkStatus() {
  const payId = document
    .getElementById("checkPayId")
    .value.trim()
    .toUpperCase();
  const result = document.getElementById("statusResult");
  const card = document.getElementById("statusCard");
  if (!payId) return;

  card.innerHTML = '<p style="color:var(--muted)">Fetching...</p>';
  result.style.display = "block";

  try {
    const res = await fetch(`${API}/payment/${payId}`);
    const data = await res.json();

    if (!data.success) {
      card.innerHTML = `<p style="color:var(--red)">${data.message}</p>`;
      return;
    }

    const rows = [
      ["Payment ID", `<span class="mono">${data.paymentId}</span>`],
      ["Status", `<span class="badge ${data.status}">${data.status}</span>`],
      [
        "Sender",
        `${data.senderName} <span class="mono" style="color:var(--muted);font-size:0.75rem">(${data.senderId})</span>`,
      ],
      [
        "Receiver",
        `${data.receiverName} <span class="mono" style="color:var(--muted);font-size:0.75rem">(${data.receiverId})</span>`,
      ],
      [
        "Amount",
        `<strong>₹ ${data.amount.toLocaleString()}</strong> ${data.currency}`,
      ],
      ["Created", new Date(data.createdAt).toLocaleString()],
      ["Updated", new Date(data.updatedAt).toLocaleString()],
    ];
    if (data.failureReason) {
      rows.push([
        "Failure Reason",
        `<span style="color:var(--red)">${data.failureReason}</span>`,
      ]);
    }
    card.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="status-row"><span class="key">${k}</span><span class="val">${v}</span></div>`,
      )
      .join("");
  } catch (e) {
    card.innerHTML = `<p style="color:var(--red)">Connection error.</p>`;
  }
}

// ══════════════════════════════════════════════════
// PART 4 — REFUND SYSTEM
// ══════════════════════════════════════════════════

let refundTargetPaymentId = null;

function openRefundModal(paymentId, amount, receiverName) {
  refundTargetPaymentId = paymentId;
  document.getElementById("refundModalPayId").textContent = paymentId;
  document.getElementById("refundModalAmount").textContent =
    `₹${amount.toLocaleString()}`;
  document.getElementById("refundModalReceiver").textContent = receiverName;
  document.getElementById("refundPinInput").value = "";
  document.getElementById("refundError").classList.remove("show");
  document.getElementById("refundModal").classList.add("show");
}

function closeRefundModal() {
  document.getElementById("refundModal").classList.remove("show");
  refundTargetPaymentId = null;
}

async function submitRefundRequest() {
  const pin = document.getElementById("refundPinInput").value.trim();
  const errEl = document.getElementById("refundError");
  const btn = document.getElementById("refundSubmitBtn");

  errEl.classList.remove("show");
  if (!pin) {
    errEl.textContent = "Please enter your PIN to confirm";
    errEl.classList.add("show");
    return;
  }

  btn.innerHTML = '<span class="spinner"></span>Sending...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/refund/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: refundTargetPaymentId,
        requesterId: currentUser.id,
        pin,
      }),
    });
    const data = await res.json();

    if (data.success) {
      closeRefundModal();
      showToast(
        "Refund request sent! Awaiting receiver approval. 📨",
        "success",
      );
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
  btn.disabled = false;
}

async function loadRefunds() {
  if (!currentUser) return;
  const pendingEl = document.getElementById("pendingRefundsContainer");
  const myEl = document.getElementById("myRefundsContainer");
  pendingEl.innerHTML =
    '<p style="color:var(--muted);font-size:0.875rem;">Loading...</p>';
  myEl.innerHTML =
    '<p style="color:var(--muted);font-size:0.875rem;">Loading...</p>';

  try {
    const res = await fetch(`${API}/refund/all/${currentUser.id}`);
    const data = await res.json();
    const pending = data.refunds.filter(
      (r) => r.role === "TO_APPROVE" && r.status === "PENDING",
    );
    const mine = data.refunds.filter((r) => r.role === "REQUESTED");

    pendingEl.innerHTML =
      pending.length === 0
        ? '<p style="color:var(--muted);font-size:0.875rem;">No pending refund requests to approve.</p>'
        : pending
            .map(
              (r) => `
          <div class="refund-card">
            <div class="refund-card-info">
              <div class="refund-card-row"><span class="key">Refund ID</span>  <span class="mono" style="font-size:0.78rem;color:var(--accent2)">${r.refundId}</span></div>
              <div class="refund-card-row"><span class="key">From</span>       <span><strong>${r.requesterName}</strong> (${r.requesterId})</span></div>
              <div class="refund-card-row"><span class="key">Payment ID</span> <span class="mono" style="font-size:0.78rem">${r.paymentId}</span></div>
              <div class="refund-card-row"><span class="key">Amount</span>     <span style="color:var(--yellow);font-weight:700;">₹${r.amount.toLocaleString()}</span></div>
              <div class="refund-card-row"><span class="key">Requested</span>  <span style="font-size:0.78rem;color:var(--muted)">${new Date(r.createdAt).toLocaleString()}</span></div>
            </div>
            <div class="refund-actions">
              <div class="field" style="margin-bottom:10px;">
                <label style="font-size:0.72rem;">Your PIN to confirm</label>
                <input type="password" id="pin-${r.refundId}" placeholder="••••" maxlength="6" style="padding:8px 12px;font-size:0.85rem;"/>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn-accept" onclick="actionRefund('${r.refundId}','ACCEPT')">✓ Accept</button>
                <button class="btn-reject" onclick="actionRefund('${r.refundId}','REJECT')">✗ Reject</button>
              </div>
            </div>
          </div>`,
            )
            .join("");

    myEl.innerHTML =
      mine.length === 0
        ? '<p style="color:var(--muted);font-size:0.875rem;">You have not requested any refunds yet.</p>'
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Refund ID</th><th>Payment ID</th><th>To</th><th>Amount</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            ${mine
              .map(
                (r) => `<tr>
              <td class="mono" style="font-size:0.75rem;color:var(--accent2)">${r.refundId}</td>
              <td class="mono" style="font-size:0.75rem">${r.paymentId}</td>
              <td style="font-size:0.8rem;"><strong>${r.receiverName}</strong></td>
              <td style="color:var(--yellow);font-weight:600;">₹${r.amount.toLocaleString()}</td>
              <td><span class="badge refund-${r.status}">${r.status}</span></td>
              <td style="font-size:0.78rem;color:var(--muted)">${new Date(r.createdAt).toLocaleString()}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
        </table></div>`;

    updateRefundBadge(pending.length);
  } catch (e) {
    pendingEl.innerHTML =
      '<p style="color:var(--red);font-size:0.875rem;">Failed to load. Check backend.</p>';
    myEl.innerHTML = "";
  }
}

async function actionRefund(refundId, action) {
  const pinInput = document.getElementById(`pin-${refundId}`);
  const pin = pinInput ? pinInput.value.trim() : "";
  if (!pin) {
    showToast("Please enter your PIN to confirm", "error");
    return;
  }

  try {
    const res = await fetch(`${API}/refund/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refundId, userId: currentUser.id, pin, action }),
    });
    const data = await res.json();

    if (data.success) {
      showToast(
        action === "ACCEPT"
          ? "✅ Refund accepted! Amount transferred back."
          : "❌ Refund request rejected.",
        action === "ACCEPT" ? "success" : "error",
      );
      updateBalance();
      loadRefunds();
    } else {
      showToast(data.message, "error");
    }
  } catch (e) {
    showToast("Connection error.", "error");
  }
}

async function checkPendingRefundsBadge() {
  try {
    const res = await fetch(`${API}/refund/pending/${currentUser.id}`);
    const data = await res.json();
    updateRefundBadge(data.refunds ? data.refunds.length : 0);
  } catch (e) {}
}

function updateRefundBadge(count) {
  const badge = document.getElementById("refundNavBadge");
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

// ══════════════════════════════════════════════════
// PART 5 — ANALYTICS, TAB ROUTING, TOAST
// ══════════════════════════════════════════════════

function showTab(tab) {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.getElementById("nav-" + tab).classList.add("active");
  if (tab === "history") loadHistory();
  if (tab === "analytics") loadAnalytics();
  if (tab === "refunds") loadRefunds();
}

async function loadAnalytics() {
  try {
    const res = await fetch(`${API}/summary`);
    const data = await res.json();
    const s = data.summary;

    document.getElementById("statTotal").textContent = s.total;
    document.getElementById("statSuccess").textContent = s.success;
    document.getElementById("statFailed").textContent = s.failed;
    document.getElementById("statVolume").textContent =
      "₹ " + s.totalVolume.toLocaleString("en-IN");

    const div = document.getElementById("failureBreakdown");
    if (!s.failureBreakdown || Object.keys(s.failureBreakdown).length === 0) {
      div.innerHTML =
        '<p style="color:var(--muted);font-size:0.875rem;">No failure data yet.</p>';
      return;
    }
    const total = Object.values(s.failureBreakdown).reduce((a, b) => a + b, 0);
    div.innerHTML = Object.entries(s.failureBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => {
        const pct = Math.round((count / total) * 100);
        return `<div class="bar-wrap">
          <div class="bar-label">
            <span class="key">${reason}</span>
            <span style="color:var(--text);font-family:'IBM Plex Mono',monospace">${count} (${pct}%)</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join("");
  } catch (e) {}
}

function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}
