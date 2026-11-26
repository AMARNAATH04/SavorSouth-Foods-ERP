# SavorSouth Foods ERP

**Company:** SavorSouth Foods (Tamil Nadu, India)  
**Brand Tagline:** *Tradition in Every Bite.*  
**Challenge:** NIT Tiruchirappalli Centre for Digital Infrastructure — Winter Internship 2026  

SavorSouth ERP is a full-stack, PostgreSQL-backed **Order-to-Audit Manufacturing & GST Management System** built for a South Indian snacks manufacturer (`Murukku`, `Butter Murukku`, `Banana Chips`, `Bombay Mixture`, `Traditional South Indian Snacks`, and `Sweets`).

---

## 1. Technology Stack & Justification

| Layer | Choice | Why Chosen |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS | Fast modular SPA with strict type safety and mobile/tablet/desktop responsive layouts |
| **Motion & Charts** | Framer Motion, Recharts, Lucide Icons | Purposeful subtle transitions (`prefers-reduced-motion` aware) and clean manufacturing analytics |
| **Backend** | Node.js, Express.js, TypeScript, Zod | Lightweight, strongly typed REST API with schema-level request validation |
| **Database & ORM** | PostgreSQL 17 + Prisma ORM | ACID transactions for immutable stock ledgers, weighted average costing, and relational audit integrity |
| **Auth & Security** | JWT (`jsonwebtoken`), `bcryptjs`, Helmet | Stateless role-based access control enforced on both API routes and frontend views |
| **Exports & PDF** | `jsPDF` + `jspdf-autotable`, `ExcelJS` | Instant GST tax invoice PDFs and downloadable Excel (`.xlsx`), CSV, and PDF audit reports |

---

## 2. Implemented Features & Modules

1. **Authentication & RBAC:** JWT login, bcrypt password hashing, protected routes, user management, and 5 enforced roles across 28 screens.
2. **Owner & Admin Dashboards:** Animated KPIs, batch cost breakdown charts, category sales distribution, wastage/variance alerts, and low-stock indicators.
3. **Product, Customer & Supplier Masters:** Full CRUD with HSN codes, GST rates, state codes (`33` Tamil Nadu vs inter-state), pack sizes, and active toggles.
4. **Sales Order-to-Dispatch Workflow:** Visual snack catalog for mobile salesmen → order submission → admin verification/editing → stock availability check → approval → GST invoice → dispatch.
5. **GST Billing & Credit Notes:** Automatic intra-state `CGST + SGST` (Tamil Nadu `33`) vs inter-state `IGST`, financial-year invoice numbering (`SSF/2026-27/0001`), jsPDF invoice generation, and immutable cancellation via Credit Notes (`CN/2026-27/0001`).
6. **Production Management (BOM & Floor Execution):** Configurable BOMs with unit conversion (`kg`, `grams`, `litres`, `ml`, `pieces`, `packets`, `cartons`), material issuance, good packet output, damaged packaging tracking, wastage recording, and automated variance alerts.
7. **Inventory & Immutable Stock Ledger:** Separate tracking for raw materials, packaging materials, and finished goods; every movement writes a sourced `StockMovement` record inside a PostgreSQL `$transaction` preventing negative stock.
8. **Costing, Payments & Reports:** Weighted average material valuation, direct batch overhead allocation (`Labour` + `Gas & Electricity`), partial invoice payment allocations, receivables ageing (`0–30`, `31–60`, `61–90`, `90+` days), 14 exportable reports, and an immutable `AuditLog`.

---

## 3. User Roles & Test Login Credentials

All demo accounts use password: **`Password@123`** (also available as one-click fill buttons on the Login screen).

| Role | Name | Email | Primary Capabilities |
|---|---|---|---|
| **Owner** | Karthik Sundaram | `owner@savorsouthfoods.in` | Executive analytics, costing, alerts, full oversight & settings |
| **Factory Admin** | Meenakshi Sundaram | `admin@savorsouthfoods.in` | Verify/edit/approve/reject orders, GST invoices, dispatch, payments, masters |
| **Production Supervisor** | Aravindhan R | `supervisor@savorsouthfoods.in` | Raw material receipts, BOMs, production runs, material issues, wastage |
| **Salesman A** | Prabhu K | `salesman.a@savorsouthfoods.in` | Mobile hub, assigned TN customers (Retailer A), order creation & tracking |
| **Salesman B** | Senthil M | `salesman.b@savorsouthfoods.in` | Mobile hub, assigned KA/KL customers (Distributor B), order creation |
| **Accountant / Auditor** | Lakshmi Narayanan | `auditor@savorsouthfoods.in` | Read-only access to registers, GST summaries, stock ledger, costing, audit logs & exports |

---

## 4. Database Design & Methodologies

See [docs/DESIGN_NOTE.md](docs/DESIGN_NOTE.md) for the complete Mermaid **ER Diagram**, Reference Website analysis (`https://tastyworld.in/`), and Brand Design System.

### Stock Calculation & Weighted Average Valuation
- **Immutable Ledger:** Stock balances are never overwritten directly. Every opening balance, purchase receipt, material issue, production receipt, dispatch, or adjustment appends an immutable `StockMovement` row inside `prisma.$transaction`.
- **Canonical Base Units:** Weights normalize to `GRAM` (`1 kg = 1000 g`), volumes to `ML` (`1 litre = 1000 ml`), and counts to `PIECE`.
- **Weighted Average Cost:** On each purchase, `totalValuePaisa += purchaseLineTotalPaisa` and `currentStockBase += purchaseQtyBase`. On production issue, `issueValuePaisa = round(totalValuePaisa * issueQtyBase / currentStockBase)`. All monetary values use **integer paisa** (`BigInt`) to prevent floating-point drift.

### BOM, Variance & Overhead Allocation
- **Yield Variance (%):** `((actualGoodPackets - expectedOutputPackets) / expectedOutputPackets) * 100`
- **Consumption Variance (%):** `((issuedQtyBase - plannedQtyBase) / plannedQtyBase) * 100`
- **Overhead Rule (Direct Batch Assignment):** Direct `LABOUR` and `GAS_ELECTRICITY` expenses linked to a `ProductionRun` are 100% absorbed by the good output packets of that batch:  
  `Cost per Packet = (Raw Material Cost + Packaging Cost + Labour + Gas/Electricity) / Actual Good Packets`.

---

## 5. Mandatory NIT Benchmark Results (Verified Automatically)

Executing the 15-step benchmark scenario on **Murukku 200 g** via live API transactions yields:

| Metric | Expected | Verified Result |
|---|---|---|
| Flour closing balance (`100 + 60 - 40`) | `120 kg` | `120 kg` |
| Cooking oil closing balance (`30 - 10.5`) | `19.5 litres` | `19.5 litres` |
| 200 g pouch closing balance (`500 - 188 good - 6 damaged`) | `306 pieces` | `306 pieces` |
| Finished Murukku after production (`50 + 188`) | `238 packets` | `238 packets` |
| Finished Murukku after Retailer A dispatch (`238 - 150`) | `88 packets` | `88 packets` |
| Production yield variance (`(188 - 200) / 200`) | `-6%` | `-6%` (Alert triggered) |
| Oil consumption variance (`(10.5 - 10) / 10`) | `+5%` | `+5%` (Alert triggered) |
| Batch cost per good packet (`₹5,855 / 188`) | Computed | `₹31.14 / packet` (`3114 paisa`) |
| Retailer A (TN `33`) taxable amount (`150 × ₹50`) | `₹7,500.00` | `₹7,500.00` |
| Retailer A CGST (`2.5%`) & SGST (`2.5%`) | `₹187.50` + `₹187.50` | `₹187.50` + `₹187.50` |
| Retailer A total GST invoice | `₹7,875.00` | `₹7,875.00` |
| Retailer A outstanding after `₹4,000` payment | `₹3,875.00` | `₹3,875.00` |
| Distributor B (KA `29`) order `120` pkts vs `88` available | Shortage `32 pkts` | Blocked `409`, Shortage `32 packets` |

---

## 6. Running Locally

### Prerequisites
- **Node.js v20+** and **npm 10+**
- Optional: PostgreSQL 16+ or Docker (`docker-compose.yml` included). If PostgreSQL is not installed locally, the backend automatically starts a local **embedded PostgreSQL 17** server on `localhost:5432` when `USE_EMBEDDED_DB="true"` in `backend/.env`!

### Step-by-Step Setup
```bash
# 1. Install dependencies (root, backend, frontend)
npm install
npm --prefix backend install
npm --prefix frontend install

# 2. Configure environment variables
cp backend/.env.example backend/.env

# 3. Run PostgreSQL migrations & seed database (handles embedded Postgres automatically)
npm --prefix backend run db:bootstrap

# 4. Run automated unit, RBAC & NIT Benchmark tests
npm test

# 5. Re-seed full benchmark + demo dataset (after test reset) and start full-stack app
npm --prefix backend run db:bootstrap
npm run dev
```
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000/api/health`

---

## 7. Deployment Instructions

1. **PostgreSQL:** Provision a managed PostgreSQL database (Render, Railway, Neon, or Supabase) or run `docker compose up -d`.
2. **Backend:** Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `USE_EMBEDDED_DB="false"` in production environment variables, then run:
   ```bash
   cd backend
   npm ci
   npx prisma migrate deploy
   npm run build
   npm start
   ```
3. **Frontend:** Build static assets with `cd frontend && npm ci && npm run build` and deploy `frontend/dist` to Vercel/Netlify/Nginx with `/api` proxied to the backend service.

---

## 8. Assumptions & Known Limitations

- **Assumptions:**
  - Factory operates from Tiruchirappalli, Tamil Nadu (`State Code: 33`); intra-state GST splits equally into CGST/SGST and inter-state applies IGST.
  - Primary packet pouches (`usageMode: PER_GOOD_PACKET`) consume `1` good pouch per good packet produced plus explicitly recorded damaged pouches, while cartons (`MANUAL_PER_RUN`) record exact cartons packed.
  - Salesman orders with stock shortages are permitted as `SUBMITTED` (flagged `hasStockShortage = true`) so Admin can inspect shortages (`32 packets`), while Admin approval/dispatch strictly rejects negative finished goods stock.
- **Known Limitations:**
  - Single-warehouse/plant model (no multi-godown transfer workflows).
  - E-Way Bill / GSTN portal live API filing is outside prototype scope (standard GSTR-1 style summary and tax invoice PDFs are generated).
