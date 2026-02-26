# Northern-Trust-hackathon-Project

# Mini-Payment-Gateway-Simulator

Northern Trust hackathon Project

A full-stack payment gateway simulation built by a team of 5. It mimics how real UPI-style payments work — with async processing, random bank failures, live status polling, and a multi-party refund approval system. Built with Flask, SQLite, and vanilla JavaScript.

---

# Quick Note Before You Start

After you log in, **the dashboard loads on the create payment tab by default**. The payment form is below the fold — just **scroll down** after logging in to see the Receiver ID field, Amount, PIN input, and the Send Payment button.

---

# Getting Started

### Prerequisites

- Python 3.8 or higher
- pip

### Installation

```bash
git clone https://github.com/YOUR_ORG/payflow.git
cd payflow
pip install -r requirements.txt
python app.py
```

Then open your browser and go to: **http://localhost:5000**

That's it. The database is created automatically on first run with 5 demo accounts already seeded.

---

# Demo Accounts

Use any of these to log in and test the app:

| User ID | PIN  | Name         | Starting Balance |
| ------- | ---- | ------------ | ---------------- |
| USER001 | 1234 | Arjun Sharma | ₹50,000          |
| USER002 | 5678 | Priya Patel  | ₹30,000          |
| USER003 | 9999 | Ravi Kumar   | ₹75,000          |
| USER004 | 1111 | Sneha Mehta  | ₹20,000          |
| USER005 | 0000 | Demo User    | ₹1,50,000        |

---

# Features

# Send Money

Enter a receiver's User ID, an amount, and confirm with your PIN. The payment goes through a simulated bank pipeline — there's a deliberate 3-second delay to mimic real processing, and a 15% random failure rate to simulate network/bank errors. A live modal shows you the status changing from `CREATED → PROCESSING → SUCCESS` (or `FAILED`).

If a payment fails, a **Retry** button pre-fills the form so you can try again without re-entering everything.

# Transaction History

See every payment you've sent or received. Sent payments show in red (money out), received in green (money in). Successful sent payments within the last 10 minutes show a live countdown refund button.

# Check Payment Status

Look up any payment by its ID (format: `PAY` followed by 10 characters). Useful for checking payments you didn't initiate, or for debugging.

#Analytics
A global view of all transactions — total count, success/failure split, total volume processed, and a bar chart breaking down failure reasons.

### ↩ Refunds

A two-party refund system. The sender requests a refund, the receiver gets notified and must approve or reject it. Both sides need to confirm with their PIN.

Rules:

- Only the original sender can request
- Only works on successful payments
- Must be requested within 10 minutes of payment completion
- One refund request per payment — no duplicate requests
- The receiver must have enough balance to approve

---

# Payment State Machine

Every payment moves through these states:

```
CREATED → PROCESSING → SUCCESS
                     ↘ FAILED
```

- **CREATED** — payment record saved, background thread started
- **PROCESSING** — bank picked it up (1 second in)
- **SUCCESS** — money transferred between balances (3 seconds in)
- **FAILED** — rejected by the simulated bank engine

Failure reasons you might see: `INSUFFICIENT_BALANCE`, `BANK_SERVER_TIMEOUT`, `NETWORK_ERROR`, `DAILY_LIMIT_EXCEEDED`, `INVALID_AMOUNT`, `AMOUNT_EXCEEDS_LIMIT`

---

## ↩ Refund State Machine

```
payment.refund_status:   none → pending → accepted
                                        ↘ rejected
```

The Refund column in Transaction History reflects this in real time — no page refresh needed.

---

## Database Schema

Three tables, all in a local SQLite file (`payments.db`) that gets created on first run.

**users**

```
id       TEXT  PRIMARY KEY
name     TEXT
pin      TEXT
balance  REAL  DEFAULT 10000.0
```

**payments**

```
payment_id      TEXT  PRIMARY KEY   (format: PAYxxxxxxxxxx)
sender_id       TEXT  → users.id
receiver_id     TEXT  → users.id
amount          REAL
currency        TEXT  DEFAULT 'INR'
status          TEXT  DEFAULT 'CREATED'
failure_reason  TEXT  (nullable)
refund_status   TEXT  DEFAULT 'none'
created_at      TEXT
updated_at      TEXT
```

**refund_requests**

```
refund_id    TEXT  PRIMARY KEY   (format: REFxxxxxxxxxx)
payment_id   TEXT  → payments.payment_id
requester_id TEXT  → users.id
receiver_id  TEXT  → users.id
amount       REAL
currency     TEXT  DEFAULT 'INR'
status       TEXT  DEFAULT 'PENDING'
created_at   TEXT
updated_at   TEXT
```

---

# API Reference

### Auth

| Method | Endpoint     | Description                                     |
| ------ | ------------ | ----------------------------------------------- |
| POST   | `/api/auth`  | Verify User ID + PIN. Returns name and balance. |
| GET    | `/api/users` | List all users (id + name only, no PINs).       |

### Payments

| Method | Endpoint                  | Description                                    |
| ------ | ------------------------- | ---------------------------------------------- |
| POST   | `/api/payment/create`     | Create a new payment and start processing.     |
| GET    | `/api/payment/<id>`       | Get status of a single payment.                |
| GET    | `/api/payments/user/<id>` | Get all payments for a user (sent + received). |

### Refunds

| Method | Endpoint                   | Description                                           |
| ------ | -------------------------- | ----------------------------------------------------- |
| POST   | `/api/refund/request`      | Sender requests a refund (PIN required).              |
| GET    | `/api/refund/pending/<id>` | Get refund requests waiting for this user's approval. |
| GET    | `/api/refund/all/<id>`     | Get all refunds related to a user.                    |
| POST   | `/api/refund/action`       | Receiver approves or rejects a refund (PIN required). |

### Analytics

| Method | Endpoint       | Description                                                       |
| ------ | -------------- | ----------------------------------------------------------------- |
| GET    | `/api/summary` | Global stats — total, success, failed, volume, failure breakdown. |

---

# Project Structure

```
payflow/
├── app.py                  ← Flask backend (all routes + DB logic)
├── requirements.txt
├── payments.db             ← Auto-created on first run (do not commit)
├── static/
│   ├── script.js           ← All frontend JavaScript
│   └── styles.css          ← Full CSS design system
└── templates/
    └── index.html          ← Single-page app shell
```

# Known Quirks

- **Scroll down after login** — the Send Money form is below the visible area on first load. Just scroll down to see it.
- **15% failure rate is intentional** — payments randomly fail to simulate real bank errors. Use the Retry button.
- **10-minute refund window** — the countdown timer in Transaction History is real. Once it hits zero, you can't request a refund for that payment.
- **`payments.db` is auto-created** — if you delete it, the app recreates it fresh with the same demo users on next startup.
- **Don't commit `payments.db`** — it's in `.gitignore` for a reason. Everyone should have their own local DB.

---

# requirements.txt

```
flask>=2.3.0
flask-cors>=4.0.0
```
