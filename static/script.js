const API = "http://localhost:5000/api";

// ── Part 1 fills: currentUser, allUsers, login(), logout(), showPage(), loadAllUsers(), lookupReceiver(), updateBalance() ──
// ── Part 5 fills: showTab(), showToast() ──

// ════════════════════════════════════════════
// ── PART 2: PAYMENTS — Send Money & Modal ───
// ════════════════════════════════════════════

let lastPaymentDetails = null; // stored for retry (no PIN)
let pollInterval       = null;

async function initiatePayment() {
  const receiverId = document.getElementById("receiverId").value.trim().toUpperCase();
  const amount     = parseFloat(document.getElementById("payAmount").value);
  const pin        = document.getElementById("payPin").value.trim();
  const errEl      = document.getElementById("payError");
  const btn        = document.getElementById("payBtn");

  errEl.classList.remove("show");

  if (!receiverId)          { errEl.textContent = "Enter a receiver ID";   errEl.classList.add("show"); return; }
  if (!amount || amount<=0) { errEl.textContent = "Enter a valid amount";  errEl.classList.add("show"); return; }
  if (!pin)                 { errEl.textContent = "Enter your UPI PIN";    errEl.classList.add("show"); return; }

  btn.innerHTML = '<span class="spinner"></span>Initiating...';
  btn.disabled  = true;

  try {
    const res  = await fetch(`${API}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: currentUser.id, receiverId, amount, currency: "INR", pin }),
    });
    const data = await res.json();

    if (data.success) {
      lastPaymentDetails = { receiverId, amount };
      document.getElementById("receiverId").value  = "";
      document.getElementById("payAmount").value   = "";
      document.getElementById("payPin").value      = "";
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
  btn.disabled  = false;
}

function retryPayment() {
  if (!lastPaymentDetails) return;
  const { receiverId, amount } = lastPaymentDetails;
  document.getElementById("receiverId").value = receiverId;
  document.getElementById("payAmount").value  = amount;
  document.getElementById("payPin").value     = "";
  document.getElementById("payError").classList.remove("show");
  lookupReceiver();
  closeModal();
  showTab("pay");
  setTimeout(() => { const a = document.getElementById("payAmount"); a.focus(); a.select(); }, 150);
  showToast("Details pre-filled — adjust amount if needed, then enter your PIN.", "");
}

function showPayModal(paymentId) {
  document.getElementById("modalIcon").textContent  = "⏳";
  document.getElementById("modalTitle").textContent = "Payment Initiated";
  document.getElementById("modalMsg").textContent   = "Your payment is being processed by the bank...";
  document.getElementById("modalPayId").textContent = paymentId;
  document.getElementById("modalBadge").textContent = "CREATED";
  document.getElementById("modalBadge").className   = "badge CREATED";
  document.getElementById("modalPoll").textContent  = "Waiting for bank response...";
  document.getElementById("modalCloseBtn").style.display = "none";
  document.getElementById("modalRetryBtn").style.display = "none";
  document.getElementById("payModal").classList.add("show");
  pollInterval = setInterval(() => pollPayment(paymentId), 1500);
}

async function pollPayment(paymentId) {
  try {
    const res  = await fetch(`${API}/payment/${paymentId}`);
    const data = await res.json();
    const badge = document.getElementById("modalBadge");
    badge.textContent = data.status;
    badge.className   = "badge " + data.status;

    if (data.status === "PROCESSING") {
      document.getElementById("modalPoll").textContent = "Bank is processing your request...";
    }
    if (data.status === "SUCCESS") {
      clearInterval(pollInterval);
      document.getElementById("modalIcon").textContent  = "✅";
      document.getElementById("modalTitle").textContent = "Payment Successful!";
      document.getElementById("modalMsg").textContent   = `₹${data.amount.toLocaleString()} sent to ${data.receiverName}`;
      document.getElementById("modalPoll").textContent  = "";
      document.getElementById("modalCloseBtn").style.display = "inline-block";
      document.getElementById("modalRetryBtn").style.display = "none";
      updateBalance();
      showToast("Payment successful! ✅", "success");
    }
    if (data.status === "FAILED") {
      clearInterval(pollInterval);
      document.getElementById("modalIcon").textContent  = "❌";
      document.getElementById("modalTitle").textContent = "Payment Failed";
      document.getElementById("modalMsg").textContent   = `Reason: ${data.failureReason || "Unknown"}`;
      document.getElementById("modalPoll").textContent  = "Amount will not be deducted.";
      document.getElementById("modalCloseBtn").style.display = "inline-block";
      if (lastPaymentDetails) document.getElementById("modalRetryBtn").style.display = "inline-block";
      showToast("Payment failed: " + data.failureReason, "error");
    }
  } catch (e) {}
}

function closeModal() {
  clearInterval(pollInterval);
  document.getElementById("payModal").classList.remove("show");
}
