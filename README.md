# MurgaMandi Hisab

Daily billing, expenses and reports for a murga mandi business. Plain HTML, CSS and JavaScript: no build step, no server, no external libraries. Open `index.html` in Chrome (desktop or phone) or host the folder on any static host (it is published with GitHub Pages).

## Six sections

| # | Section | Folder | Calculation |
|---|---------|--------|-------------|
| 1 | Zinda Single Customer Bill | `sections/zinda-single/` | Original Chicken Calculator engine (`engines/zinda/calc.js`) |
| 2 | Zinda Daily Entry | `sections/zinda-daily/` | Original Chicken Calculator engine (`engines/zinda/calc.js`) |
| 3 | Katai Single Customer Bill | `sections/katai-single/` | Katai engine (`engines/katai/calc.js`) |
| 4 | Katai Daily Customer Entry | `sections/katai-daily/` | Katai engine (`engines/katai/calc.js`) |
| 5 | Expense Management | `sections/expenses/` | `expense-calc.js` (sums only) |
| 6 | Statements & Reports | `sections/statements/` | `reports.js` (reads saved records only) |

## Folder structure

```
MurgaMandi-Hisab/
├── index.html · style.css · script.js     home: 6 cards, today's figures, backup / restore
├── sections/
│   ├── zinda-single/   index.html · style.css · script.js
│   ├── zinda-daily/    index.html · style.css · script.js
│   ├── katai-single/   index.html · style.css · script.js
│   ├── katai-daily/    index.html · style.css · script.js
│   ├── expenses/       index.html · style.css · script.js · expense-calc.js
│   └── statements/     index.html · style.css · script.js · reports.js
├── engines/
│   ├── zinda/          calc.js (original, unchanged) · share.js · keypad.js
│   └── katai/          calc.js · share.js
├── shared/
│   ├── storage-service.js   the only file that touches localStorage
│   ├── data-service.js      records, IDs, duplicate guard, backup / restore
│   ├── export-service.js    PDF, Excel (.xlsx), CSV, print
│   ├── bill-print.js/.css   shop-style bill, firm details, bill colour (single bills)
│   └── print.css            print layout for reports
├── assets/icons/ · assets/images/
└── README.md
```

Each section is its own page and loads only its own CSS and JavaScript plus the shared services, so an error in one section cannot break another. Each engine exists once: both Zinda pages load the same `engines/zinda/calc.js`, both Katai pages load `engines/katai/calc.js`. Zinda pages never load Katai code and Katai pages never load Zinda code.

## Zinda rules (unchanged from the original Chicken Calculator)

`engines/zinda/calc.js` is a byte-for-byte copy of `calc.js` from https://github.com/inamkhankhan050-maker/chicken-billing (that repository is not modified). Money is integer paise, weight integer grams.

- Net KG = Total KG − Jaal KG (Jaal must be less than Total KG).
- Basic Amount = Net KG × Rate (half-up to the paisa).
- Samiti = 1% of Basic, rounded down to the whole rupee.
- Labour by average (Net KG ÷ Pieces): below 2.50 → Pieces ÷ 9 × ₹5; 2.50–2.99 → ÷ 8 × ₹5; 3.00 and above → ÷ 7 × ₹5.
- Labour is adjusted upward so the final bill is a multiple of ₹10 (never more than ₹9.99). Basic and Samiti never change.
- Balance = Pichla Balance + Aaj ka Bill − Cash − Online (negative shows as "Adv").
- Labour charge is automatic everywhere and cannot be edited (user, 5 Nov 2026). Old bills saved with a typed labour amount keep their saved amount until they are re-saved.

## Katai rules (independent, no Zinda logic)

Products: Thigh, Breast, Tangri, Wings, Full Leg, Haddi, Pota, Panja, Tandoori, Dress. Each line has a Unit (KG or Pcs), Quantity and Rate.

- Line Amount = Quantity × Rate (half-up to the paisa). KG allows 3 decimals; Pcs must be whole. A rate with no quantity counts as not taken.
- Bill Total = sum of lines. Balance = Pichla + Total − Cash − Online.
- No labour, samiti, discount or rounding has been defined. Add a future Katai rule only in `engines/katai/calc.js`.

## Shop-style bill (Zinda Single and Katai Single)
- Print, PDF and WhatsApp photo use one bill design: firm name, top line (phone), shop line, address, optional logo and stamp, then Qty, Weight, Particulars, Rate, Amount, totals and G. TOTAL with the amount in words. A live Bill Preview sits under the form.
- `shared/bill-print.js` + `shared/bill-print.css` only draw the bill. Figures come from each section's own engine. Katai bills show no labour and no samiti.
- Firm details are saved once under `mmh.firm.v1` (shared by both bills) and stay until "Remove firm" is pressed. Old per-section firm names are moved in automatically.
- Bill colour (8 presets or your own) is saved automatically under `mmh.billTheme.v1`. Both keys are included in the home-page backup.

## Data model and storage

Everything is saved in the browser's localStorage on this device, under one versioned key `mmh.db.v2` (written only by `storage-service.js`). Money is integer paise, dates `YYYY-MM-DD`.

- `customer` { id, name, key }
- `bill` { id, section (zinda / katai), source (which page), sourceKey, date, customerId, customerName, firm, amount, cash, online, prevBalance, balance, lines, details }
- `payment` { id, section, source, date, customer, firm, cash, online, prevBalance, balance } (a daily-sheet row with only money received)
- `expense` { id, date, categoryId, description, amount, mode (cash / online), paidTo, notes }
- `category` { id, name } (custom categories; the 9 defaults are built in)

Rules: every record gets a unique id. Single bills save with "Save Bill" and can be updated or deleted (with confirmation). Daily sheets save each row under its row id, so saving again updates the same record instead of adding a duplicate. A bill with the same customer, date, amount and section raises a duplicate warning. Corrupt storage is set aside (`mmh.db.v2.corrupt`) and the page starts clean instead of crashing.

Other keys: in-progress sheets and firm names per section (`mmh.zindaSingle.v1`, `mmh.zindaDaily.v1`, `mmh.zindaDaily.inbox`, `mmh.kataiSingle.v1`, `mmh.kataiDaily.v1`, `mmh.kataiDaily.previous`, `mmh.*.firm`) and view settings (`mmh.expenses.view`, `mmh.statements.view`). v1 sheets keep loading.

Backup: the home page downloads the whole database as a JSON file. Restore checks the file, shows its record counts, and asks before replacing current data. Take a backup regularly; clearing the browser's data deletes everything.

## Expense Management

9 default categories plus custom ones (a custom category in use cannot be removed). Add, edit, delete (confirmed), search, filter by date, category and payment mode. Daily, monthly, yearly, date-range and all views. Dashboard: today, this month, this year, total cash, total online. Category-wise totals. Statements and category-wise reports in PDF, Excel, CSV and print.

## Statements & Reports: how figures are worked out

Reports only read saved records; they never change a bill or recalculate it.

- **Customer statements.** Bills, cash and online are summed from records in the period. Opening balance = the previous balance written on the customer's first record in the period (or the last recorded balance before it). Remaining balance = the balance on the last record. Zinda and Katai balances are kept separately and added when both are shown. If opening + bills − received does not match the recorded remaining balance, the page flags the difference.
- **Company-wise records.** Built only from firm names typed on bills. Records without a firm are counted as "no firm", never guessed.
- **Profit & Loss.** Net = Total recorded income (Zinda + Katai bills) − Total recorded expenses. Based on recorded income and recorded expenses only: purchase and stock costs are not recorded, so this is not a full profit figure.
- **Cash & Online statement.** Cash received and cash expenses are kept apart from online received and online expenses. Opening cash is an optional amount you enter; without it, closing cash shows as "Not recorded".
- **Download Center.** 11 downloads (all customer records, all customer statements, single customer statement, daily, monthly, yearly, all company records, company-wise, Profit & Loss, cash statement, expense statement), each as PDF, Excel (.xlsx) or CSV.

## Exports

- Excel: real `.xlsx` written by `export-service.js` (zip + SpreadsheetML). The daily sheets' own quick export is still the v1 `.xls`.
- PDF: multi-page, with MurgaMandi Hisab branding, title, period, table, totals and page numbers. Amounts print as "Rs.". Names in Hindi script switch that PDF to page images.
- CSV: UTF-8 with BOM, guarded against spreadsheet formula injection.
- Print: print stylesheets on every report.

## Security

User text is escaped or set with `textContent`; no `eval`; inputs are validated (no negatives or letters, decimal limits). Nothing is sent to a server.

## Testing

- `node test.js` (jsdom): 343 checks: Zinda engine identical to the original and loaded once, labour slab boundaries, samiti, ₹10 round-up, labour locked to auto, Katai independence, duplicate guard, repeat saves, backup → clear → restore, corrupt storage, a broken shared service, expense add / edit / delete, daily / monthly / yearly totals, customer statements, company grouping, P&L, cash / online separation, CSV guard, escaping. Test fixtures are not shipped.
- Real Chromium at 1366×900, 820×1180 and 390×844: all 7 pages, every button clicked, save flows, all 33 Download Center files checked with openpyxl and pypdf (columns re-totalled).
- Not tested: real phones, real print dialogs, restore through a real file picker.
