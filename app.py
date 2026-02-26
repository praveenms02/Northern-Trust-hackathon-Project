"""
PayFlow — Mini Payment Gateway Simulator
Flask + SQLite backend
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

# ════════════════════════════════════
# ── PART 5: get_db / init_db ────────  (skeleton — Part 5 fills this)
# ════════════════════════════════════
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    pass  # Part 5 implements table creation + seed

# ════════════════════════════════════
# ── PART 1: AUTH ROUTES ─────────────
# ════════════════════════════════════
@app.route("/api/auth", methods=["POST"])
def authenticate():
    """Verify user ID + PIN, return name & balance."""
    data    = request.get_json()
    user_id = data.get("userId", "").strip().upper()
    pin     = data.get("pin",    "").strip()

    if not user_id or not pin:
        return jsonify({"success": False, "message": "User ID and PIN are required"}), 400

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, balance FROM users WHERE id=? AND pin=?", (user_id, pin))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"success": False, "message": "Invalid User ID or PIN"}), 401

    return jsonify({"success": True, "userId": user["id"],
                    "name": user["name"], "balance": user["balance"]})

@app.route("/api/users", methods=["GET"])
def list_users():
    """Return all users — id + name only (no PINs)."""
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM users ORDER BY name")
    users  = [{"id": r["id"], "name": r["name"]} for r in cursor.fetchall()]
    conn.close()
    return jsonify({"success": True, "users": users})

# ── stubs filled by other parts ──────────────────────

if __name__ == "__main__":
    init_db()
    print("\n🚀 PayFlow running at http://localhost:5000")
    print("📋 Demo: USER001/1234  USER002/5678  USER003/9999")
    app.run(debug=True, port=5000)
