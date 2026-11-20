# Villa Budget

A web app for a shared villa (about 18 residents). It handles:
- 100 AED collections on the 1st and the 15th of every month
- **pro-rata leave**: people pay only for the days they are in the villa
- **Cash** and **Digital** balances, transfers between them, and expenses
- balances carried forward from cycle to cycle.

**Stack:** React 19 + Vite (client) · Node.js + Express 5 + Mongoose (API) · MongoDB Atlas.


## Run locally

```bash
npm install                       # installs both workspaces
cp server/.env.example server/.env   # then put your MongoDB connection string in it
npm run seed                      # optional: fills an EMPTY database with the starting data
npm run dev                       # API on http://localhost:4100, web app on http://localhost:5180
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests of the calculation engine (Vinay leave example, carry-forward, join/exit, rounding) |
| `npm run build` | Builds the React app into `client/dist` |
| `npm start` | Starts the API. If `client/dist` exists it also serves the built app on port 4100 |

Ports 4000 and 5173 were already in use on this machine, so this project uses **4100** (API) and **5180** (web).

## Open it from other devices on the same Wi-Fi / LAN
Both servers listen on all network interfaces, and `npm run dev` prints the address to use:

```
[web]   ➜  Network: http://10.10.10.33:5180/      ← open this on a phone / laptop
[api]   on your network: http://10.10.10.33:4100
```

- Open **http://&lt;computer-IP&gt;:5180** on the other device. The browser only talks to Vite, and Vite forwards `/api` to the API on the host computer.
- iPhone, iPad and Mac can also use **http://&lt;computer-name&gt;.local:5180**. Android and Windows usually need the IP.
- The IP can change after a router restart (DHCP). Re-check it with `ipconfig getifaddr en0`, or reserve it in the router.
- To run without the dev server, use `npm run build && npm start`. One port then serves everything: **http://&lt;computer-IP&gt;:4100**.
- If another device can't connect, check that the macOS firewall allows incoming connections for `node` (System Settings → Network → Firewall). Also check that the Wi-Fi isn't a guest network with "client isolation" turned on.

> **There is no login yet.** Anyone on the same network who opens the address can see and change the data, so use this only on a trusted home network (login is phase 2 in the SRS).

## How the money is calculated
For each member and each cycle (1st–14th, and 15th to month end):

```
due          = charge(days as member)
net due      = charge(days present)                     (present = member days − leave days)
leave credit = due − net due
net payable = brought forward + net due
balance     = net payable − paid cash − paid digital     (negative = advance, deducted next cycle)
fund closing= opening + collections − expenses ± transfers   (separately for Cash and Digital)
```

`charge(days)` depends on the **leave / part-cycle rule** in Settings:

| Rule | charge(days) | Example: 15th cycle (16 days), 1 day away |
|---|---|---|
| **Daily rate** (current; same as the villa's Google Sheet) | whole cycle → 100 · none → 0 · otherwise `MIN(100, ROUND(days × 6.58, 2))` | 15 × 6.58 = **98.70** |
| Pro-rata | `ROUND(100 × days ÷ days in cycle, 2)` | 100 × 15 ÷ 16 = **93.75** |

All of this lives in [server/src/lib/ledger.js](server/src/lib/ledger.js). It is a pure function, unit-tested in [server/test/ledger.test.js](server/test/ledger.test.js). Dues and balances are never stored; they are always derived from members, leaves, payments, expenses and transfers.

## Changing the collection amount for a cycle
On **Collections**, choose the cycle with ◀ ▶ and click **Change amount**. You then pick one of two options:

- **Only this cycle**: a one-off, for example 150 for one collection. The cycles after it keep their amount.
- **This and all later cycles**: applies until the next change, like a row in the Google Sheet's "Collection amount changes" table.

Under the daily-rate rule, the part-cycle rate scales with the amount: `ROUND(amount × 6.58 ÷ 100, 2)`, so 150 gives 9.87 a day. **Reset** removes the change for that cycle. All changes are listed in **Settings → Collection amount changes**, and the Dashboard highlights cycles whose amount differs from the standard. Changing the *standard* amount in Settings changes every cycle, including past ones.

## Bills (photos / PDFs on expenses)
On the **Expenses** page you can attach bills while adding or editing an expense, or later with the paperclip on any row. Click a thumbnail to view the bill, step through several, open it in a new tab, download it or delete it.

- **Formats:** JPG, PNG, WEBP and PDF, up to 10 MB each, and at most 10 per expense. The server checks each file's real type from its first bytes, so a renamed file can't get through.
- **Photo resizing:** photos are resized in the browser before upload (longest side 1800 px, JPEG). A typical 3–5 MB phone photo becomes about 50–400 KB, which keeps the database small.
- **Storage:** files are stored in MongoDB (GridFS bucket `bills`), so every device sees them. Deleting a bill or its expense deletes the file.
- **Re-importing the sheet** keeps bills on expenses that still match (same date, category, amount, paid from and description) and lists any it can't match.

## Replacing the data from the Google Sheet
[server/data/google-sheet-snapshot.json](server/data/google-sheet-snapshot.json) is a copy of the villa's Google Sheet, taken on 20 Nov 2026. It contains settings, members, leaves, payments, expenses and transfers. To load it (or a newer copy) into MongoDB:

```bash
npm run import -w server -- data/google-sheet-snapshot.json         # dry run: shows what would change
npm run import -w server -- data/google-sheet-snapshot.json --yes   # backs up, then replaces ALL data
```

The import checks every row first and saves the current data to `backups/db-<time>.json` (git-ignored). It then deletes the old data and inserts the new in one transaction, so either everything changes or nothing does.

## Project layout

```
client/            React + Vite app (pages: Dashboard, Collections, Members, Leaves, Expenses, Transfers, Settings)
server/src/
  lib/ledger.js    calculation engine (pure)
  lib/dates.js     cycle & date helpers (dates are "YYYY-MM-DD" strings)
  models/          Mongoose schemas
  routes/api.js    REST API
  seed.js          starting data for an empty database
docs/SRS.md        software requirements specification
tools/build_villa_v2.py  generator for the matching Excel workbook
```

## Security note
`server/.env` holds the database password. It is git-ignored; never commit it.
