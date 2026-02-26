"""PayFlow — Mini Payment Gateway Simulator"""
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

# ── Part 1: /api/auth, /api/users ───────────────────────────────────────
# ── Part 2: determine_outcome, process_payment_async, /api/payment/create
# ── Part 3: /api/payment/<id>, /api/payments/user/<id> ──────────────────

# ════════════════════════════════════
# ── PART 4: REFUND ROUTES ───────────
# ════════════════════════════════════

@app.route("/api/refund/request", methods=["POST"])
def request_refund():
    """
    Sender of a successful payment requests a refund.
    State: payment.refund_status → 'pending'
    Rules: only sender, only SUCCESS, within 10-min window, not already requested.
    """
    data         = request.get_json()
    payment_id   = data.get("paymentId",   "").strip().upper()
    requester_id = data.get("requesterId", "").strip().upper()
    pin          = data.get("pin",         "").strip()

    conn   = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE id=? AND pin=?", (requester_id, pin))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Authentication failed. Wrong PIN."}), 401

    cursor.execute("SELECT * FROM payments WHERE payment_id=?", (payment_id,))
    payment = cursor.fetchone()

    if not payment:
        conn.close()
        return jsonify({"success": False, "message": "Payment not found"}), 404
    if payment["sender_id"] != requester_id:
        conn.close()
        return jsonify({"success": False, "message": "Only the original sender can request a refund"}), 403
    if payment["status"] != "SUCCESS":
        conn.close()
        return jsonify({"success": False, "message": "Refund only available for successful payments"}), 400
    if payment["refund_status"] in ("accepted", "rejected"):
        conn.close()
        return jsonify({"success": False, "message": "Refund already processed."}), 400
    if payment["refund_status"] == "pending":
        conn.close()
        return jsonify({"success": False, "message": "A refund request is already pending for this payment."}), 400

    elapsed = (datetime.now() - datetime.fromisoformat(payment["updated_at"])).total_seconds()
    if elapsed > 600:
        conn.close()
        return jsonify({"success": False, "message": "Refund window expired (10 minutes)."}), 400

    refund_id = "REF" + uuid.uuid4().hex[:10].upper()
    now       = datetime.now().isoformat()

    conn.execute("""
        INSERT INTO refund_requests
          (refund_id, payment_id, requester_id, receiver_id, amount, currency, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    """, (refund_id, payment_id, requester_id, payment["receiver_id"],
          payment["amount"], payment["currency"], now, now))

    conn.execute("UPDATE payments SET refund_status='pending' WHERE payment_id=?", (payment_id,))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "refundId": refund_id,
                    "message": f"Refund request sent. Awaiting approval from {payment['receiver_id']}."}), 201


@app.route("/api/refund/pending/<user_id>", methods=["GET"])
def get_pending_refunds(user_id):
    """Refund requests waiting for this user's approval."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, req.name AS requester_name, rec.name AS receiver_name
        FROM refund_requests r
        JOIN users req ON r.requester_id = req.id
        JOIN users rec ON r.receiver_id  = rec.id
        WHERE r.receiver_id=? AND r.status='PENDING'
        ORDER BY r.created_at DESC
    """, (user_id.upper(),))
    rows = cursor.fetchall()
    conn.close()

    refunds = [{"refundId": r["refund_id"], "paymentId": r["payment_id"],
                "requesterId": r["requester_id"], "requesterName": r["requester_name"],
                "receiverId": r["receiver_id"],   "receiverName": r["receiver_name"],
                "amount": r["amount"], "currency": r["currency"],
                "status": r["status"], "createdAt": r["created_at"]} for r in rows]

    return jsonify({"success": True, "refunds": refunds})


@app.route("/api/refund/all/<user_id>", methods=["GET"])
def get_all_refunds(user_id):
    """All refunds where user is requester OR receiver."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, req.name AS requester_name, rec.name AS receiver_name
        FROM refund_requests r
        JOIN users req ON r.requester_id = req.id
        JOIN users rec ON r.receiver_id  = rec.id
        WHERE r.requester_id=? OR r.receiver_id=?
        ORDER BY r.created_at DESC
    """, (user_id.upper(), user_id.upper()))
    rows = cursor.fetchall()
    conn.close()

    refunds = [{"refundId": r["refund_id"], "paymentId": r["payment_id"],
                "requesterId": r["requester_id"], "requesterName": r["requester_name"],
                "receiverId": r["receiver_id"],   "receiverName": r["receiver_name"],
                "amount": r["amount"], "currency": r["currency"],
                "status": r["status"], "createdAt": r["created_at"],
                "role": "REQUESTED" if r["requester_id"] == user_id.upper() else "TO_APPROVE"
               } for r in rows]

    return jsonify({"success": True, "refunds": refunds})


@app.route("/api/refund/action", methods=["POST"])
def action_refund():
    """
    Receiver approves or rejects a refund.
    ACCEPT: transfers money back and marks payment.refund_status = 'accepted'
    REJECT: marks payment.refund_status = 'rejected'
    """
    data      = request.get_json()
    refund_id = data.get("refundId", "").strip().upper()
    user_id   = data.get("userId",   "").strip().upper()
    pin       = data.get("pin",      "").strip()
    action    = data.get("action",   "").strip().upper()

    if action not in ("ACCEPT", "REJECT"):
        return jsonify({"success": False, "message": "Action must be ACCEPT or REJECT"}), 400

    conn   = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE id=? AND pin=?", (user_id, pin))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "Authentication failed. Wrong PIN."}), 401

    cursor.execute("SELECT * FROM refund_requests WHERE refund_id=?", (refund_id,))
    refund = cursor.fetchone()

    if not refund:
        conn.close()
        return jsonify({"success": False, "message": "Refund not found"}), 404
    if refund["receiver_id"] != user_id:
        conn.close()
        return jsonify({"success": False, "message": "Only the refund receiver can act on this request"}), 403
    if refund["status"] != "PENDING":
        conn.close()
        return jsonify({"success": False, "message": f"Refund is already {refund['status']}"}), 400

    now = datetime.now().isoformat()

    if action == "ACCEPT":
        cursor.execute("SELECT balance FROM users WHERE id=?", (user_id,))
        receiver = cursor.fetchone()
        if not receiver or receiver["balance"] < refund["amount"]:
            conn.close()
            return jsonify({"success": False, "message": "Insufficient balance to process refund"}), 400

        conn.execute("UPDATE users SET balance = balance - ? WHERE id=?", (refund["amount"], refund["receiver_id"]))
        conn.execute("UPDATE users SET balance = balance + ? WHERE id=?", (refund["amount"], refund["requester_id"]))
        conn.execute("UPDATE refund_requests SET status='ACCEPTED', updated_at=? WHERE refund_id=?", (now, refund_id))
        conn.execute("UPDATE payments SET refund_status='accepted' WHERE payment_id=?", (refund["payment_id"],))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Refund of ₹{refund['amount']} accepted and transferred back."})
    else:
        conn.execute("UPDATE refund_requests SET status='REJECTED', updated_at=? WHERE refund_id=?", (now, refund_id))
        conn.execute("UPDATE payments SET refund_status='rejected' WHERE payment_id=?", (refund["payment_id"],))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Refund request rejected."})

# ── Part 5: /api/summary ────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("\n🚀 PayFlow running at http://localhost:5000")
    app.run(debug=True, port=5000)
