// Categories for each transaction type
const categories = {
  expense: ["Food", "Transport", "Rent", "Bills", "Shopping", "Health", "Other"],
  income: ["Salary", "Freelance", "Gift", "Other"]
};

let transactions = [];  // loaded from the database through Flask
let editingId = null;  // null = adding, otherwise the id being edited

const form = document.getElementById("transaction-form");
const formTitle = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const typeInput = document.getElementById("type");
const categoryInput = document.getElementById("category");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("date");
const descriptionInput = document.getElementById("description");
const list = document.getElementById("transaction-list");
const emptyMessage = document.getElementById("empty-message");

const today = () => new Date().toISOString().split("T")[0];

const formatMoney = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

// Fill the category dropdown based on the selected type
function loadCategories(selected) {
  categoryInput.innerHTML = categories[typeInput.value]
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
  if (selected) categoryInput.value = selected;
}

// Update the three dashboard numbers
function updateSummary() {
  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;

  document.getElementById("total-income").textContent = formatMoney(income);
  document.getElementById("total-expense").textContent = formatMoney(expense);

  const balanceEl = document.getElementById("balance");
  balanceEl.textContent = formatMoney(balance);
  balanceEl.className = "amount " + (balance < 0 ? "expense" : "income");
}

// Send a request to Flask and return the JSON reply
async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

// READ: load all transactions from the database
async function loadTransactions() {
  try {
    transactions = await api("/transactions");
    updateSummary();
    renderTransactions();
  } catch (err) {
    alert("Could not load transactions: " + err.message);
  }
}

// Make a small button for a table row
function makeButton(text, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "row-btn " + className;
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

// Draw the transaction table (newest first)
function renderTransactions() {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  list.innerHTML = "";
  sorted.forEach((t) => {
    const row = document.createElement("tr");
    const sign = t.type === "income" ? "+" : "−";

    // textContent is used so user input is never treated as HTML
    [t.date, t.description || "—", t.category].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    });

    const amountCell = document.createElement("td");
    amountCell.className = "right " + t.type;
    amountCell.textContent = sign + formatMoney(t.amount);
    row.appendChild(amountCell);

    const actionCell = document.createElement("td");
    actionCell.className = "right";
    actionCell.appendChild(makeButton("Edit", "edit", () => startEdit(t.id)));
    actionCell.appendChild(makeButton("Delete", "delete", () => deleteTransaction(t.id)));
    row.appendChild(actionCell);

    list.appendChild(row);
  });

  emptyMessage.hidden = transactions.length > 0;
}

// Put the form into "add" mode
function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = today();
  loadCategories();
  formTitle.textContent = "Add transaction";
  submitBtn.textContent = "Add transaction";
  cancelBtn.hidden = true;
}

// UPDATE (step 1): load a transaction into the form
function startEdit(id) {
  const t = transactions.find((item) => item.id === id);
  if (!t) return;

  editingId = id;
  typeInput.value = t.type;
  loadCategories(t.category);
  amountInput.value = t.amount;
  dateInput.value = t.date;
  descriptionInput.value = t.description;

  formTitle.textContent = "Edit transaction";
  submitBtn.textContent = "Update transaction";
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
}

// DELETE
async function deleteTransaction(id) {
  if (!confirm("Delete this transaction?")) return;
  try {
    await api(`/delete/${id}`, "DELETE");
    if (editingId === id) resetForm();
    await loadTransactions();
  } catch (err) {
    alert(err.message);
  }
}

// INSERT (add) and UPDATE (save edit)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    type: typeInput.value,
    amount: parseFloat(amountInput.value),
    category: categoryInput.value,
    date: dateInput.value,
    description: descriptionInput.value.trim()
  };

  try {
    if (editingId === null) {
      await api("/add", "POST", data);
    } else {
      await api(`/update/${editingId}`, "PUT", data);
    }
    resetForm();
    await loadTransactions();
  } catch (err) {
    alert(err.message);
  }
});

typeInput.addEventListener("change", () => loadCategories());
cancelBtn.addEventListener("click", resetForm);

// Start
resetForm();
loadTransactions();