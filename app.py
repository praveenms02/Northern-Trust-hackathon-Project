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

# ════════════════════════════════════
# ── PART 3: HISTORY & STATUS ────────
# ════════════════════════════════════

@app.route("/api/payment/<payment_id>", methods=["GET"])
def get_payment_status(payment_id):
    """Fetch a single payment by ID. Also used by Part 2 polling."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.*, s.name AS sender_name, r.name AS receiver_name
        FROM payments p
        JOIN users s ON p.sender_id   = s.id
        JOIN users r ON p.receiver_id = r.id
        WHERE p.payment_id = ?
    """, (payment_id.upper(),))
    payment = cursor.fetchone()
    conn.close()

    if not payment:
        return jsonify({"success": False, "message": "Payment not found"}), 404

    return jsonify({
        "success":       True,
        "paymentId":     payment["payment_id"],
        "senderId":      payment["sender_id"],
        "senderName":    payment["sender_name"],
        "receiverId":    payment["receiver_id"],
        "receiverName":  payment["receiver_name"],
        "amount":        payment["amount"],
        "currency":      payment["currency"],
        "status":        payment["status"],
        "failureReason": payment["failure_reason"],
        "refundStatus":  payment["refund_status"],
        "createdAt":     payment["created_at"],
        "updatedAt":     payment["updated_at"],
    })


@app.route("/api/payments/user/<user_id>", methods=["GET"])
def get_user_payments(user_id):
    """All payments sent or received by a user, newest first."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.*, s.name AS sender_name, r.name AS receiver_name
        FROM payments p
        JOIN users s ON p.sender_id   = s.id
        JOIN users r ON p.receiver_id = r.id
        WHERE p.sender_id = ? OR p.receiver_id = ?
        ORDER BY p.created_at DESC
    """, (user_id.upper(), user_id.upper()))
    rows = cursor.fetchall()
    conn.close()

    payments = []
    for p in rows:
        payments.append({
            "paymentId":     p["payment_id"],
            "senderId":      p["sender_id"],
            "senderName":    p["sender_name"],
            "receiverId":    p["receiver_id"],
            "receiverName":  p["receiver_name"],
            "amount":        p["amount"],
            "currency":      p["currency"],
            "status":        p["status"],
            "failureReason": p["failure_reason"],
            "refundStatus":  p["refund_status"],
            "createdAt":     p["created_at"],
            "type":          "SENT" if p["sender_id"] == user_id.upper() else "RECEIVED"
        })

    return jsonify({"success": True, "payments": payments})

if __name__ == "__main__":
    init_db()
    print("\n🚀 PayFlow running at http://localhost:5000")
    app.run(debug=True, port=5000)
