# Villa Budget — Software Requirements Specification (SRS)

| | |
|---|---|
| **Product** | Villa Budget – shared-expense manager for a villa of ~18 residents |
| **Version** | 1.0 (MVP implemented in this repository) |
| **Date** | 20-Nov-2026 |
| **Status** | Draft for review |
| **Source of truth for rules** | `Villa_Monthly_Budget_v2.xlsx` (same formulas) and `server/src/lib/ledger.js` |

---

## 1. Introduction

### 1.1 Purpose
This document specifies what the Villa Budget application must do. It covers the bi-monthly collection from residents, the fair (pro-rata) charge when someone is on leave or joins or leaves mid-cycle, the two fund balances (Cash and Digital), and expenses. It also covers carrying each cycle's balance forward. It is written for the developers, testers and product owner of the application.

### 1.2 Scope
The application replaces the villa's Excel workbook with a web application. The treasurer (admin) uses it to:
- maintain the member list (people join and leave over time)
- mark leave periods
- record each member's payment on the 1st and 15th of every month
- record expenses and Cash ↔ Digital transfers
- see live balances, pending dues and per-member statements.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Collection** | Fixed amount each member pays per cycle (default **100 AED**). |
| **Cycle** | Half a month. **1st cycle** = days 1–14 (14 days). **15th cycle** = day 15 to month end (13–17 days). A cycle is identified by its start date: `YYYY-MM-01` or `YYYY-MM-15`. |
| **Member days** | Days of a cycle that fall between the member's Join Date and Exit Date (inclusive). |
| **Leave days** | Member days covered by an eligible leave. |
| **Present days** | Member days − leave days. |
| **Due** | Charge for the member days: 100 × member days ÷ cycle days. |
| **Leave credit** | The part of Due not charged because of leave. |
| **Net payable** | Brought forward + Due − Leave credit. |
| **B/F, C/F** | Brought forward / carried forward balance (member or fund). |
| **Advance** | A negative member balance: they paid more than was due. It is deducted automatically from their next collection. |
| **Fund** | One of the two money pools: **Cash** (in hand) and **Digital** (bank / wallet). |
| **Transfer** | Money moved between Cash and Digital. The total is unchanged. |

### 1.4 References
- `Villa_Monthly_Budget.xlsx`: the original workbook. Its sheets were Guide, Dashboard, Member Summary, Settings, Members, Leave Log, Expenses, Transfers and 12 month tabs.
- `Villa_Monthly_Budget_v2.xlsx`: the corrected workbook with the pro-rata leave rule. It has been checked formula by formula against this application.

---

## 2. Overall description

### 2.1 Problem with the original workbook

| # | Problem | Effect | Requirement that fixes it |
|---|---|---|---|
| P1 | Leave credit used a fixed 6.58 AED/day. | A member away for a whole 14-day cycle still owed 7.88 AED. | BR-3 |
| P2 | The credit was applied only at the collection after the leave ended. | Vinay (leave 1–15 Nov) would be asked for 200 AED on 15 Nov and refunded 98.70 on 1 Dec. | BR-3, BR-5 |
| P3 | Long leaves showed growing "pending" dues. | Misleading reminders were sent to people who were away. | BR-3 |

### 2.2 Users and roles

| Role | Description | Permissions (MVP) |
|---|---|---|
| **Treasurer / Admin** | Collects money, records expenses. | Full access. |
| **Member** *(phase 2)* | Any resident. | Read-only: their own statement and the villa balances. |

### 2.3 Operating environment
- **Client:** a responsive web app (React + Vite) that runs in any modern browser, on desktop and on mobile.
- **Server:** Node.js (Express REST API).
- **Database:** MongoDB (Atlas).
- **Time zone:** Asia/Dubai. Dates are calendar dates without time (`YYYY-MM-DD`).
- **Currency:** AED, 2 decimals.

### 2.4 Assumptions and constraints
- There are two collections a month, on the 1st and the 15th. The amount is configurable.
- One villa per deployment (multi-villa support is phase 2).
- Members are never hard-deleted once they have payments or leaves. An Exit Date is used instead.

---

## 3. Functional requirements

### 3.1 Settings (FR-S)
| ID | Requirement |
|---|---|
| FR-S1 | Admin can set the villa name, the **start month** (must be the 1st of a month), the **collection amount** (default 100), the **decimal places** for part-cycle amounts (2 = exact, 0 = whole AED), and the **minimum leave days** for a credit (default 1). |
| FR-S2 | Admin can set the **opening Cash** and **opening Digital** balances: the money in hand on the start date. |
| FR-S3 | Admin can maintain the list of **expense categories** (defaults: Water, Grocery, Gas Cylinder, Cleaning Supplies, Electricity / Internet, Miscellaneous). |
| FR-S4 | Any change to the settings recalculates every balance immediately. |

### 3.2 Member management (FR-M)
| ID | Requirement |
|---|---|
| FR-M1 | **Add member:** name (unique, required), room / bed, phone, join date (optional – empty means already living there), exit date (optional), opening balance (+ owes / − advance), notes. |
| FR-M2 | **Edit member:** any field. If both dates are set, the exit date must not be before the join date. |
| FR-M3 | **Member leaves the villa:** admin sets the Exit Date (last day staying). No dues are charged after that date. The last cycle is charged per day. |
| FR-M4 | **Delete:** allowed only when the member has no payments and no leaves. Otherwise the system refuses and asks for an Exit Date instead. |
| FR-M5 | **Status** is derived automatically for today: *Upcoming* (join date in future), *Active*, *On Leave* (today inside a leave), *Left* (exit date in past). |
| FR-M6 | **Member list** shows status, dates, opening balance, total paid, leave days, leave credits and current balance. |
| FR-M7 | **Member statement:** one row per cycle showing B/F, days in villa, leave days, due, leave credit, net payable, paid cash, paid digital and balance. It also lists the member's leaves. |

### 3.3 Leave management (FR-L)
| ID | Requirement |
|---|---|
| FR-L1 | Admin can **mark a leave**: member, first day away, last day away (both inclusive), reason. A leave may be entered before, during or after the absence. |
| FR-L2 | **Validation:** both dates required; last day ≥ first day; the member must exist; the leave must be within the member's join / exit dates; it must **not overlap** another leave of the same member (HTTP 409). |
| FR-L3 | A leave shorter than the minimum leave days gets no credit. It is stored and shown as "below minimum". |
| FR-L4 | Admin can edit or delete a leave. All dues are recalculated. |
| FR-L5 | The leave form shows a live preview: days away and the approximate credit. |
| FR-L6 | The credit is applied to **every cycle the leave touches**, in proportion to the days in each cycle (BR-3). |

### 3.4 Collections (FR-C)
| ID | Requirement |
|---|---|
| FR-C1 | The system generates cycles automatically, from the start month up to the current cycle (and later if data exists). There is no manual "create cycle" step. |
| FR-C2 | The **Collections screen** for a selected cycle (previous / next navigation) lists every member in the villa during that cycle with: B/F, days in villa, leave days, due, leave credit, net payable, paid cash, paid digital and balance. |
| FR-C3 | Admin can **record a payment** for a member and cycle: amount and mode (Cash / Digital). A member may pay in several parts and in both modes. A **"Full"** shortcut records the full remaining balance. |
| FR-C4 | A **negative amount** records a refund (e.g. returning an advance when someone moves out). |
| FR-C5 | Admin can delete a wrongly recorded payment. |
| FR-C6 | A cycle summary shows: members charged, due after leave credits, leave credits, collected, still pending, and advance held. |
| FR-C7 | People not in the villa during the cycle are hidden by default, with a "show all" toggle. Someone who still has a non-zero balance is always shown. |

### 3.5 Funds and transfers (FR-F)
| ID | Requirement |
|---|---|
| FR-F1 | The system keeps two funds, **Cash** and **Digital**. Each payment, expense and transfer belongs to exactly one fund (a transfer moves money from one fund to the other). |
| FR-F2 | Admin can record a **transfer**: date, direction (*Cash to Digital* / *Digital to Cash*), amount, done by, notes. |
| FR-F3 | Per cycle, for each fund: **Closing = Opening + Collections − Expenses ± Transfers**. Each cycle's closing balance becomes the next cycle's opening balance (carry forward). |

### 3.6 Expenses (FR-E)
| ID | Requirement |
|---|---|
| FR-E1 | Admin can add an expense: date, category, description, **paid from (Cash / Digital)**, amount, paid / bought by, bill / ref no. |
| FR-E2 | An expense counts in the cycle that contains its date (1st–14th or 15th–end). |
| FR-E3 | Admin can edit or delete an expense. Balances are recalculated. |
| FR-E4 | The expense list can be filtered by month and shows totals by fund and by category. |
| FR-E5 | *(Phase 2)* Attach a photo of the receipt. |

### 3.6.1 Groceries (FR-G)
A grocery shopping trip is an expense in the grocery category (Settings → *Category shown on the Groceries page*, default **Grocery**), with a list of the items bought. There is no separate grocery ledger, so grocery money is never counted twice.

| ID | Requirement |
|---|---|
| FR-G1 | Admin can add a grocery purchase: date, paid from (Cash / Digital), bought by, shop / note, bill / ref no., and any number of items (up to 200). Each item has a name, quantity, unit (pcs, kg, g, L, ml, pack, dozen, bundle, bottle, box, bag, tray) and the price paid for that line. |
| FR-G2 | The bill total defaults to the sum of the item prices and can be changed (e.g. for bags, VAT or a discount); the screen shows the difference. A purchase may be saved without items and itemised later. |
| FR-G3 | The purchase is saved as an expense, so it reduces the Cash or Digital fund exactly as in FR-E1–E3 and also appears on the Expenses screen. Editing it on the Expenses screen keeps its items. |
| FR-G4 | The Groceries screen lists every expense in the grocery category (including ones entered on the Expenses screen), filterable by month and searchable by item, shop or person. |
| FR-G5 | Items & prices: one row per item (names compared ignoring case and extra spaces) with times bought, last bought date, last quantity and price, latest / lowest / highest / average price per base unit, total quantity and total spent, plus the full purchase history. |
| FR-G6 | Prices are compared per base unit: g → kg, ml → L, dozen → 12 pcs. Unit-price figures only use purchases in the same base unit as the latest one. The change against the previous purchase is shown as ▲ dearer / ▼ cheaper. |
| FR-G7 | While typing an item that was bought before, the screen shows its last purchase (date, shop, quantity, price, price per unit) and how today's price compares. |
| FR-G8 | Re-importing the Google Sheet keeps item lists on expenses that still match (same rule as bills) and lists the ones it cannot match. |
| FR-G9 | The item name box searches the product list (FR-P) as the user types: by name (starts-with first) or category, showing each product's category, unit and last price; with no text it lists the most recently bought first. Choosing a product fills the name and its usual unit. Keyboard: ↑ ↓ to move, Enter to pick (Enter never submits the purchase), Esc to close. |
| FR-G10 | A typed name that is not a product is accepted; it is added to the product list (unit from that line, no category) when the purchase is saved, and the screen says so before and after saving. |

### 3.6.2 Products (FR-P)
| ID | Requirement |
|---|---|
| FR-P1 | Admin can add a product: name (required, unique ignoring letter case and extra spaces), category (suggested list or free text), usual unit, notes. |
| FR-P2 | The product list is grouped by category and can be searched by name or category and filtered by category. Each product shows times bought, last bought date, latest price per unit with the change against the previous purchase, lowest price and total spent (from grocery items with the same name). |
| FR-P3 | Admin can edit a product. Renaming it also renames the matching items in past purchases, so its price history stays together. Renaming onto another product's name is refused (409). |
| FR-P4 | A product that appears in any purchase cannot be deleted (409 with the reason); unused products can. |
| FR-P5 | Items in purchases that are not products (e.g. saved before the product list existed) are listed on the Products screen with an action that adds them all. |

### 3.7 Dashboard and reports (FR-D)
| ID | Requirement |
|---|---|
| FR-D1 | KPI cards: cash in hand, digital balance, total balance, pending dues now, members in the villa today, members on leave today. |
| FR-D2 | Cycle-by-cycle ledger: opening, collections, expenses, transfers and closing per fund, plus pending dues and leave credits. The current cycle is highlighted. |
| FR-D3 | Lists of who owes the villa, who is on leave today, and who has paid in advance. |
| FR-D4 | *(Phase 2)* Export the ledger, collections and statements to Excel / PDF. |
| FR-D5 | *(Phase 2)* A "share" text for WhatsApp with each person's amount due for the current cycle. |

### 3.8 Notifications (FR-N, phase 2)
| ID | Requirement |
|---|---|
| FR-N1 | A reminder to the treasurer on the 1st and 15th listing the amount each member owes. |
| FR-N2 | Optional reminder to members with a pending balance. |

### 3.9 Audit and data (FR-A)
| ID | Requirement |
|---|---|
| FR-A1 | Every record stores created / updated timestamps. |
| FR-A2 | *(Phase 2)* An audit log of who changed what and when, including deleted payments and expenses. |
| FR-A3 | *(Phase 2)* Closing a cycle: closed cycles become read-only. A leave or payment change affecting a closed cycle is posted as an **adjustment** to the member's next open cycle. |
| FR-A4 | Seed / import: an empty database can be loaded with the villa's starting data (`npm run seed`). Seeding never overwrites existing data. |

---

## 4. Business rules (calculation)

For a member *m* and a cycle *c* (start `cs`, end `ce`, `cycleDays = ce − cs + 1`):

| ID | Rule |
|---|---|
| BR-1 | `memberDays = max(0, min(ce, exitDate) − max(cs, joinDate) + 1)`. A blank join or exit date means no limit. |
| BR-2 | `leaveDays` = number of member days covered by any **eligible** leave of *m* (eligible = leave length ≥ minimum leave days). |
| BR-3 | `due = ROUND(collection × memberDays ÷ cycleDays, decimals)`; `netDue = ROUND(collection × (memberDays − leaveDays) ÷ cycleDays, decimals)`; `leaveCredit = due − netDue`. A whole cycle away gives netDue = 0; a fully present member gives exactly the collection amount. |
| BR-4 | `broughtForward` = the member's balance after the previous cycle. For the first cycle it is the member's opening balance. |
| BR-5 | `netPayable = broughtForward + netDue`; `balance = netPayable − paidCash − paidDigital`. A **negative balance is an advance**. It automatically reduces the next cycle's net payable, so any credit for days already paid is "deducted from the next collection". |
| BR-6 | Fund closing per cycle: `closingCash = openingCash + collectionsCash − expensesCash + transfersToCash`; `closingDigital = openingDigital + collectionsDigital − expensesDigital − transfersToCash`. |
| BR-7 | Rounding: money is rounded to 2 decimals, half away from zero (same as Excel `ROUND`). |
| BR-8 | Cycles: the 1st cycle is the 1st–14th; the 15th cycle is the 15th to the last day of the month (Feb: 14 or 15 days; 31-day months: 17 days). |

---

## 5. Worked examples

### 5.1 Vinay on leave 1–15 Nov 2026 and did not pay on 1 Nov
| Cycle | Cycle days | Leave days | Due | Leave credit | Net payable |
|---|---|---|---|---|---|
| 1–14 Nov | 14 | 14 | 100.00 | 100.00 | **0.00** |
| 15–30 Nov | 16 | 1 (15 Nov) | 100.00 | 6.25 (= 100 × 1 ÷ 16) | **93.75** |

### 5.2 The same leave, but Vinay had already paid 100 on 1 Nov
| Cycle | B/F | Net due | Paid | Balance |
|---|---|---|---|---|
| 1–14 Nov | 0.00 | 0.00 | 100.00 | **−100.00** (advance) |
| 15–30 Nov | −100.00 | 93.75 | 0.00 | **−6.25** → pays nothing |
| 1–14 Dec | −6.25 | 100.00 | | net payable **93.75** |

### 5.3 Villa balance carry-forward (illustrative Cash/Digital split)
On 1 Nov the villa has 1,700 AED, all in Cash. Groceries of 1,154 AED are bought from Cash. 17 of the 18 members pay 100 each: 10 in cash and 7 digitally. Vinay is on leave.

| 1st cycle (1–14 Nov) | Cash | Digital | Total |
|---|---|---|---|
| Opening (b/f) | 1,700.00 | 0.00 | 1,700.00 |
| + Collections | 1,000.00 | 700.00 | 1,700.00 |
| − Expenses | 1,154.00 | 0.00 | 1,154.00 |
| **Closing (c/f → opening of 15 Nov)** | **1,546.00** | **700.00** | **2,246.00** |

The 15th cycle's total due is 17 × 100 + 93.75 = **1,793.75 AED**.

> These examples are automated tests in `server/test/ledger.test.js`, and the same numbers appear in `Villa_Monthly_Budget_v2.xlsx`.

---

## 6. Data model (MongoDB collections)

| Collection | Key fields | Notes |
|---|---|---|
| `settings` | key=`main`, villaName, startMonth, collectionAmount, roundDecimals, minLeaveDays, openingCash, openingDigital, categories[], groceryCategory | Singleton |
| `members` | name (unique), room, phone, joinDate, exitDate, openingBalance, notes | No hard delete once used |
| `leaves` | member → members, startDate, endDate, reason | Indexed by member; no overlaps per member |
| `payments` | member → members, cycle (`YYYY-MM-01/15`), date, mode (Cash/Digital), amount, note | Several per member per cycle allowed; negative = refund |
| `expenses` | date, category, description, paidFrom (Cash/Digital), amount, paidBy, ref, bills[], items[] (name, qty, unit, price) | Indexed by date; items list what a grocery trip bought |
| `transfers` | date, direction, amount, doneBy, notes | Indexed by date |
| `products` | name, key (lower-case name, unique), category, unit, notes | Grocery items link to a product by `key` |
| `users`, `auditlogs` | *(phase 2)* | Roles and change history |

Dates are stored as ISO strings `YYYY-MM-DD`, which avoids time-zone shifts. Dues and balances are **not stored**. They are always derived from the records above by the calculation engine, so a correction anywhere is reflected everywhere.

---

## 7. Interface (REST API)

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/api/settings` | Read / update settings |
| GET | `/api/ledger` | KPIs, cycle ledger, member summary |
| GET | `/api/collections/:cycle` | One cycle: member rows, fund summary, payments |
| GET / POST / PUT / DELETE | `/api/members[/:id]` | Members (delete only if unused) |
| GET | `/api/members/:id/statement` | Per-cycle statement for one member |
| GET / POST / PUT / DELETE | `/api/leaves[/:id]` | Leaves (validated, no overlap) |
| POST / DELETE | `/api/payments[/:id]` | Record / remove a payment |
| GET / POST / PUT / DELETE | `/api/expenses[/:id]` | Expenses (an optional `items` list is checked and replaced only when sent) |
| GET | `/api/groceries` | Grocery-category expenses, the unit list, the per-item price summary and the product list |
| GET / POST / PUT / DELETE | `/api/products[/:id]` | Product list with price stats and not-yet-listed items; rename also renames past items; delete only if unused |
| POST | `/api/products/from-purchases` | Add every item from past purchases that is not a product yet |
| GET / POST / PUT / DELETE | `/api/transfers[/:id]` | Transfers |

Errors return `{ "error": "message" }` with 400 (validation), 404 (not found) or 409 (conflict).

### Screens
Dashboard · Collections (per cycle) · Members · Member statement · Leaves · Expenses · Groceries · Products · Transfers · Settings.

---

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Accuracy:** every amount is correct to 2 decimals, and results equal the Excel v2 workbook for the same data. |
| NFR-2 | **Performance:** each screen loads in under 1 s for 50 members and 5 years of data. |
| NFR-3 | **Security:** database credentials live only in `server/.env` (git-ignored). *(Phase 2)* Admin login is required for any write; members get read-only access. |
| NFR-4 | **Reliability:** MongoDB Atlas automated backups are enabled; the seed script never overwrites data. |
| NFR-5 | **Usability:** responsive layout down to 360 px width; colour coding (red = owes, green = advance, orange = leave); inline validation messages. |
| NFR-6 | **Maintainability:** the calculation engine is a pure, unit-tested module (`server/src/lib/ledger.js`), separate from the database and the UI. |
| NFR-7 | **Localisation:** AED currency, dates shown as `dd-MMM-yyyy`, Asia/Dubai time zone. |

---

## 9. Acceptance criteria (Given / When / Then)

1. **Full-cycle leave.** *Given* Vinay is on leave 1–14 Nov. *When* the 1 Nov collection is opened, *then* his net payable is 0.00 and the leave credit is 100.00.
2. **Partial leave.** *Given* the leave is 1–15 Nov. *When* the 15 Nov collection is opened, *then* his net payable is 93.75 (credit 6.25).
3. **Paid before leave recorded.** *Given* Vinay paid 100 on 1 Nov. *When* the leave 1–15 Nov is saved, *then* his 1 Nov balance becomes −100.00 and his 15 Nov net payable becomes −6.25.
4. **Overlapping leave.** *Given* an existing leave 1–15 Nov. *When* a leave 10–20 Nov is saved for the same member, *then* it is rejected with "Overlaps an existing leave".
5. **Join mid-cycle.** *Given* a new member joins on 20 Nov. *Then* their 15 Nov cycle due is 100 × 11 ÷ 16 = 68.75.
6. **Exit mid-cycle.** *Given* a member's exit date is 7 Nov. *Then* their 1 Nov due is 50.00 and the 15 Nov due is 0.00.
7. **Carry forward.** *Given* opening Cash 1,700 and a grocery expense of 1,154 from Cash on 1 Nov, with no collections. *Then* the 1 Nov cycle closes with Cash 546.00, and the 15 Nov cycle opens with Cash 546.00.
8. **Transfer.** *When* 500 is moved Cash → Digital on 5 Nov, *then* Cash falls by 500, Digital rises by 500, and the total is unchanged.
9. **Delete protection.** *Given* a member with payments. *When* deleting the member, *then* the system refuses and asks for an Exit Date.

---

## 10. Traceability: Excel → application

| Excel sheet | Application module |
|---|---|
| Settings | Settings screen, `settings` collection |
| Members | Members screen, `members` collection |
| Leave Log | Leaves screen, `leaves` collection |
| Month tabs (Nov-26 … Oct-27) | Collections screen (one cycle at a time), `payments` collection |
| Expenses | Expenses screen, `expenses` collection; grocery rows also on the Groceries screen |
| Transfers | Transfers screen, `transfers` collection |
| Dashboard | Dashboard screen (`/api/ledger`) |
| Member Summary | Members list and member statement |
| Guide | In-app hints and this SRS |

## 11. Out of scope for the MVP (planned phase 2)
Login and roles, the audit log, closing cycles, receipt photos, Excel/PDF export, WhatsApp sharing, notifications, and multiple villas.
