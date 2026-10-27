import os
from flask import Flask, jsonify, render_template, request
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)

# Change this to match your PostgreSQL setup, or set the DATABASE_URL environment variable.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:ROOT@localhost:5432/expense_tracker",
)


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db():
    """Create the transactions table if it does not exist yet."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id          SERIAL PRIMARY KEY,
                type        VARCHAR(7)    NOT NULL CHECK (type IN ('income', 'expense')),
                amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
                category    VARCHAR(50)   NOT NULL,
                description VARCHAR(100)  NOT NULL DEFAULT '',
                date        DATE          NOT NULL,
                created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
            )
            """
        )
    # The "with conn" block above commits automatically; close the connection now.
    conn.close()


def row_to_dict(row):
    """Convert a database row into something JSON can handle."""
    return {
        "id": row["id"],
        "type": row["type"],
        "amount": float(row["amount"]),
        "category": row["category"],
        "description": row["description"],
        "date": row["date"].isoformat(),
    }


def read_transaction_data():
    """Read and check the JSON sent by the frontend. Returns (data, error)."""
    body = request.get_json(silent=True) or {}
    try:
        data = {
            "type": body.get("type"),
            "amount": float(body.get("amount")),
            "category": (body.get("category") or "").strip(),
            "description": (body.get("description") or "").strip()[:100],
            "date": body.get("date"),
        }
    except (TypeError, ValueError):
        return None, "Amount must be a number."

    if data["type"] not in ("income", "expense"):
        return None, "Type must be income or expense."
    if data["amount"] <= 0:
        return None, "Amount must be greater than zero."
    if not data["category"] or not data["date"]:
        return None, "Category and date are required."
    return data, None


@app.route("/")
def index():
    return render_template("index.html")


# READ
@app.route("/transactions", methods=["GET"])
def get_transactions():
    conn = get_connection()
    with conn, conn.cursor() as cur:
        cur.execute("""
    SELECT
        id,
        transaction_type AS type,
        amount,
        category,
        description,
        transaction_date AS date
    FROM transactions
    ORDER BY transaction_date DESC, id DESC
""")
        rows = cur.fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows])


# INSERT
@app.route("/add", methods=["POST"])
def add_transaction():
    data, error = read_transaction_data()
    if error:
        return jsonify({"error": error}), 400

    conn = get_connection()
    with conn, conn.cursor() as cur:
        cur.execute(
           """
INSERT INTO transactions (
    title, amount, transaction_type, category,
    transaction_date, description
)
VALUES (
    %(description)s, %(amount)s, %(type)s, %(category)s,
    %(date)s, %(description)s
)
RETURNING
    id,
    transaction_type AS type,
    amount,
    category,
    description,
    transaction_date AS date
""",
            data,
        )
        row = cur.fetchone()
    conn.close()
    return jsonify(row_to_dict(row)), 201

# UPDATE
@app.route("/update/<int:transaction_id>", methods=["PUT"])
def update_transaction(transaction_id):
    data, error = read_transaction_data()

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE transactions
                SET
                    title = %(description)s,
                    transaction_type = %(type)s,
                    amount = %(amount)s,
                    category = %(category)s,
                    transaction_date = %(date)s,
                    description = %(description)s
                WHERE id = %(id)s
                RETURNING
                    id,
                    transaction_type AS type,
                    amount,
                    category,
                    description,
                    transaction_date AS date
                """,
                {**data, "id": transaction_id},
            )

            row = cur.fetchone()

    if row is None:
        return jsonify({"error": "Transaction not found."}), 404

    return jsonify(row_to_dict(row))

# DELETE
# DELETE
@app.route("/delete/<int:transaction_id>", methods=["DELETE"])
def delete_transaction(transaction_id):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM transactions
                WHERE id = %s
                RETURNING id
                """,
                (transaction_id,),
            )

            deleted_row = cur.fetchone()

    if deleted_row is None:
        return jsonify({"error": "Transaction not found."}), 404

    return jsonify({"message": "Transaction deleted successfully."})

if __name__ == "__main__":
    init_db()
    app.run(debug=True)