# 🏭 Iron Factory Management System

A full-stack inventory and logistics management system built for iron/steel manufacturing facilities.

## Features

- 🔐 **Secure Authentication** — Admin & Yard Operator roles with session-based login
- 📦 **Inventory Management** — Register material SKUs with size, selling price, category, and yard location
- 🚚 **Dispatch & Restocking** — Log outbound shipments and incoming raw material deliveries
- 📊 **KPI Dashboard** — Live stock values, low-stock alerts, and sales totals in ₹ (INR)
- 🏗️ **Warehouse Capacity** — Visual capacity bars for Raw Material Yard, Finished Goods Hub, Blast Furnace Yard, Rolling Mill Area
- 📑 **Audit Reports** — Full stock audit text reports with category/location breakdowns
- 🖨️ **Dispatch Bill Printing** — Print professional cargo dispatch invoices
- 📥 **CSV Export** — Export full inventory sheet as CSV
- 💾 **Persistent Storage** — File-based JSON database (no external DB required)

## Tech Stack

- **Frontend:** HTML5, Vanilla CSS, Vanilla JavaScript
- **Backend:** Node.js (no frameworks, pure `http` module)
- **Database:** File-based JSON (`data/*.json`)
- **Icons:** Lucide Icons
- **Charts:** ApexCharts

## Setup & Run

```bash
# Install dependencies (none required — pure Node.js)
node server.js
```

Then open **http://localhost:3000** in your browser.

## Default Admin Registration

When registering, use admin code: **`FORGE2026`** to create an Admin account.

## Project Structure

```
├── server.js          # Backend REST API + file-based auth
├── index.html         # Main frontend UI
├── app.js             # Frontend logic & API calls
├── styles.css         # Dark glassmorphic styling
├── data/
│   └── inventory.json # Persistent inventory storage
└── .gitignore
```

## Currency

All prices are in **Indian Rupees (₹)** with `en-IN` locale formatting.

---

Built for **FerrumForge Industrial** iron factory operations.
