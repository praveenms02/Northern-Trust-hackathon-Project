// PayFlow — Frontend JS
const API = "http://localhost:5000/api";

// ════════════════════════════════════════════
// ── PART 1: AUTH — Globals & Session State ──
// ════════════════════════════════════════════
let currentUser = null;
let allUsers    = [];
let lastPaymentDetails  = null; // Part 2 uses this
let refundTimerInterval = null; // Part 3 uses this

// ── Login ──
async function login() {
  const userId = document.getElementById("loginUserId").value.trim().toUpperCase();
  const pin    = document.getElementById("loginPin").value.trim();
  const errEl  = document.getElementById("loginError");
  const btn    = document.getElementById("loginBtn");

  errEl.classList.remove("show");
  btn.innerHTML = '<span class="spinner"></span>Verifying...';
  btn.disabled  = true;

  try {
    const res  = await fetch(`${API}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin }),
    });
    const data = await res.json();

    if (data.success) {
      currentUser = { id: data.userId, name: data.name, balance: data.balance, pin };
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
    errEl.textContent = "Cannot connect to server. Make sure backend is running on port 5000.";
    errEl.classList.add("show");
  }

  btn.innerHTML = "Login & Verify";
  btn.disabled  = false;
}

// ── Logout ──
function logout() {
  currentUser        = null;
  lastPaymentDetails = null;
  if (refundTimerInterval) { clearInterval(refundTimerInterval); refundTimerInterval = null; }
  document.getElementById("loginUserId").value = "";
  document.getElementById("loginPin").value    = "";
  document.getElementById("loginError").classList.remove("show");
  showPage("loginPage");
}

// ── Page navigation ──
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ── Load all users (for receiver lookup in Part 2) ──
async function loadAllUsers() {
  try {
    const res  = await fetch(`${API}/users`);
    const data = await res.json();
    allUsers   = data.users || [];
  } catch (e) {}
}

// ── Receiver card lookup (used in Send Money form) ──
function lookupReceiver() {
  const id   = document.getElementById("receiverId").value.trim().toUpperCase();
  const card = document.getElementById("receiverCard");
  const user = allUsers.find(u => u.id === id);
  if (user && user.id !== currentUser.id) {
    document.getElementById("receiverAv").textContent    = user.name[0];
    document.getElementById("receiverName").textContent  = user.name;
    document.getElementById("receiverIdLabel").textContent = user.id;
    card.classList.add("show");
  } else {
    card.classList.remove("show");
  }
}

// ── Balance refresh (called after successful payment/refund) ──
async function updateBalance() {
  try {
    const res  = await fetch(`${API}/auth`, {
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

// ── Stub placeholders (filled by other parts) ──
function showTab(tab) { /* Part 5 */ }
function initiatePayment() { /* Part 2 */ }
function loadHistory() { /* Part 3 */ }
function checkStatus() { /* Part 3 */ }
function loadAnalytics() { /* Part 5 */ }
function loadRefunds() { /* Part 4 */ }
function openRefundModal() { /* Part 4 */ }
function submitRefundRequest() { /* Part 4 */ }
function actionRefund() { /* Part 4 */ }
function checkPendingRefundsBadge() { /* Part 4 */ }
function updateRefundBadge() { /* Part 4 */ }
function showToast() { /* Part 5 */ }
function showPayModal() { /* Part 2 */ }
function retryPayment() { /* Part 2 */ }
function closeModal() { /* Part 2 */ }
function closeRefundModal() { /* Part 4 */ }

// Enter key triggers login
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("loginPage").classList.contains("active")) login();
});
