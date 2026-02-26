"""
PayFlow — Mini Payment Gateway Simulator
"""
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3, uuid, random, time, threading
from datetime import datetime

app  = Flask(__name__)
CORS(app)
DB_PATH = "payments.db"

@app.route("/")
def home():
    return render_template("index.html")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    pass  # Part 5 fills this

# ── Part 1 routes: /api/auth, /api/users ──────────────────────────────────

# ════════════════════════════════════
# ── PART 2: PAYMENT STATE MACHINE ───
# ════════════════════════════════════
def determine_outcome(sender_id, receiver_id, amount):
    """Rule-based + 15% random failure engine."""
    conn   = get_db()
    cursor = conn.cursor()

    if amount <= 0:
        conn.close(); return False, "INVALID_AMOUNT"
    if amount > 100000:
        conn.close(); return False, "AMOUNT_EXCEEDS_LIMIT"

    cursor.execute("SELECT balance FROM users WHERE id=?", (sender_id,))
    sender = cursor.fetchone()
    if not sender or sender["balance"] < amount:
        conn.close(); return False, "INSUFFICIENT_BALANCE"

    cursor.execute("SELECT id FROM users WHERE id=?", (receiver_id,))
    if not cursor.fetchone():
        conn.close(); return False, "INVALID_ACCOUNT"

    conn.close()

    if random.random() < 0.15:
        return False, random.choice(["BANK_SERVER_TIMEOUT", "NETWORK_ERROR", "DAILY_LIMIT_EXCEEDED"])

    return True, None


def process_payment_async(payment_id):
    """
    Simulates bank delay. Runs in background thread.
    State machine: CREATED → PROCESSING → SUCCESS | FAILED
    """
    time.sleep(1)
    conn = get_db()
    now  = datetime.now().isoformat()
    conn.execute("UPDATE payments SET status='PROCESSING', updated_at=? WHERE payment_id=?", (now, payment_id))
    conn.commit()

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM payments WHERE payment_id=?", (payment_id,))
    payment = cursor.fetchone()

    time.sleep(2)
    success, reason = determine_outcome(payment["sender_id"], payment["receiver_id"], payment["amount"])

    now = datetime.now().isoformat()
    if success:
        conn.execute("UPDATE users SET balance = balance - ? WHERE id=?", (payment["amount"], payment["sender_id"]))
        conn.execute("UPDATE users SET balance = balance + ? WHERE id=?", (payment["amount"], payment["receiver_id"]))
        conn.execute("UPDATE payments SET status='SUCCESS', updated_at=? WHERE payment_id=?", (now, payment_id))
    else:
        conn.execute("UPDATE payments SET status='FAILED', failure_reason=?, updated_at=? WHERE payment_id=?",
                     (reason, now, payment_id))

    conn.commit()
    conn.close()


@app.route("/api/payment/create", methods=["POST"])
def create_payment():
    """Create payment record (CREATED), kick off async processing thread."""
    data        = request.get_json()
    sender_id   = data.get("senderId",   "").strip().upper()
    receiver_id = data.get("receiverId", "").strip().upper()
    amount      = float(data.get("amount", 0))
    currency    = data.get("currency",   "INR").strip().upper()
    pin         = data.get("pin",        "").strip()

    conn   = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE id=? AND pin=?", (sender_id, pin))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Authentication failed. Wrong PIN."}), 401

    cursor.execute("SELECT id FROM users WHERE id=?", (receiver_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": f"Receiver '{receiver_id}' not found"}), 404

    if sender_id == receiver_id:
        conn.close()
        return jsonify({"success": False, "message": "Cannot send money to yourself"}), 400

    payment_id = "PAY" + uuid.uuid4().hex[:10].upper()
    now        = datetime.now().isoformat()

    conn.execute("""
        INSERT INTO payments (payment_id, sender_id, receiver_id, amount, currency, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)
    """, (payment_id, sender_id, receiver_id, amount, currency, now, now))
    conn.commit()
    conn.close()

    thread = threading.Thread(target=process_payment_async, args=(payment_id,))
    thread.daemon = True
    thread.start()

    return jsonify({"success": True, "paymentId": payment_id,
                    "status": "CREATED", "message": "Payment initiated. Processing..."}), 201

# ── Part 3 routes: /api/payment/<id>, /api/payments/user/<id> ────────────
# ── Part 4 routes: /api/refund/* ─────────────────────────────────────────
# ── Part 5 routes: /api/summary ──────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("\n🚀 PayFlow running at http://localhost:5000")
    app.run(debug=True, port=5000)
