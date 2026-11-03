# MurgaMandi Hisab

Daily billing for a murga mandi business, with four independent sections:

| Section | Folder | Engine |
|---|---|---|
| Zinda Single Customer Bill | `sections/zinda-single/` | Original Chicken Calculator engine (`calc.js`) |
| Zinda Daily Entry | `sections/zinda-daily/` | Original Chicken Calculator engine (`calc.js`) |
| Katai Single Customer Bill | `sections/katai-single/` | Katai engine (`calc.js`, `KataiSingleCalc`) |
| Katai Daily Customer Entry | `sections/katai-daily/` | Katai engine (`calc.js`, `KataiDailyCalc`) |

No build step, no server, no external libraries. Open `index.html` in Chrome (desktop or phone) or host the folder on any static host (GitHub Pages, Netlify).

## Folder structure

```
MurgaMandi-Hisab/
├── index.html          home dashboard (4 cards)
├── home.css            home page styles only
├── home.js             home page script only (today's date)
├── sections/
│   ├── zinda-single/   index.html · style.css · script.js · calc.js · share.js · keypad.js
│   ├── zinda-daily/    index.html · style.css · script.js · calc.js · share.js · keypad.js
│   ├── katai-single/   index.html · style.css · script.js · calc.js · share.js
│   └── katai-daily/    index.html · style.css · script.js · calc.js · share.js
├── assets/
│   ├── images/
│   └── icons/          logo + section icons + WhatsApp icons (SVG)
└── README.md
```

Each section is its own page and loads only its own CSS and JavaScript, so an error in one section cannot break another.

- `script.js` is the section's UI (inputs, rendering, saving, print, export).
- `calc.js` is the section's calculation engine: pure functions, no DOM.
- `share.js` draws the bill on a canvas, turns it into a one-page PDF (hand-written, no library) and opens the phone's share sheet for WhatsApp. On a desktop it downloads the file and opens WhatsApp Web.
- `keypad.js` (Zinda only) is the original + − × ÷ keypad: number boxes accept sums like `50+60.5+94`.

## Zinda rules (taken unchanged from the original Chicken Calculator)

`sections/zinda-single/calc.js` and `sections/zinda-daily/calc.js` are byte-for-byte copies of `calc.js` from
https://github.com/inamkhankhan050-maker/chicken-billing. All money is integer paise and all weight integer grams, so there are no floating-point errors.

1. Net KG = Total KG − Jaal KG (Jaal must be less than Total KG).
2. Basic Amount = Net KG × Rate per KG (rounded half-up to the paisa).
3. Samiti = 1% of Basic Amount, rounded down to the whole rupee.
4. Labour by average bird size (Net KG ÷ Pieces, 2 decimals):
   - below 2.50 kg → Pieces ÷ 9 × ₹5
   - 2.50 to 2.99 kg → Pieces ÷ 8 × ₹5
   - 3.00 kg and above → Pieces ÷ 7 × ₹5
5. Labour is adjusted upward so the final bill is a multiple of ₹10; the adjustment is never more than ₹9.99. Basic and Samiti never change.
6. Balance Baaki = Pichla Balance + Aaj ka Bill − Rec Cash − Rec Online (a negative balance shows as "Adv").
7. Single bill only (original feature): a labour amount typed in the Labour box replaces the auto labour, with no round-off. Leave it empty for auto labour.

Validation (original): pieces must be a whole number; KG max 3 decimals; rate and money max 2 decimals; no negatives or letters.

Zinda features kept: firm/shop name, customer name, pieces, total KG, jaal KG, rate, labour, previous balance, cash, online, auto calculations, calculation preview, amount in words, print / save PDF, WhatsApp PDF or photo, multiple customers, default rate and default jaal for all rows, customer search, add 1 / add 10 / delete rows, Enter to move down a column, grand totals, Excel (.xls) and CSV export, bill sheet numbers, mobile card layout with a summary screen, auto-save.

"Add to Zinda Daily Entry" on the single bill queues the bill; it is added to the daily sheet the next time Zinda Daily Entry is opened.

The original app's Kharcha / Expense tab is not part of this project (only four sections were requested).

## Katai rules (independent, no Zinda logic)

The Katai engine only does what has been defined so far. It has no labour, samiti, jaal or round-off.

- Products: Thigh, Breast, Tangri, Wings, Full Leg, Haddi, Pota, Panja, Tandoori, Dress.
- Each product has its own Unit (KG or Pcs), Quantity and Rate.
- Line Amount = Quantity × Rate (rounded half-up to the paisa). KG allows 3 decimals; Pcs must be whole.
- A product with a rate but no quantity counts as not taken.
- Bill Total = sum of line amounts.
- Remaining Balance = Pichla Balance + Bill Total − Cash − Online (optional ledger).

Katai Daily also has: "Aaj ke Rate" (a rate per product that new customers start with), product-wise totals for the day, customer search, add/delete with confirmation, Excel export (two sheets: customers and products), CSV, print, WhatsApp PDF of the whole sheet or of one customer, and "New Day / Clear All" with a one-time Undo.

To add a Katai business rule later (a discount, a charge, rounding), change only `computeLine` / `computeBill` / `ledger` in that section's `calc.js`.

## Data and security

- Everything is stored in the browser's localStorage on this device only (`mmh.*` keys, a separate key per section). Nothing is sent anywhere.
- Saved data is checked and cleaned on load; corrupt data falls back to a fresh sheet instead of crashing.
- User text is written to the page with `textContent` or escaped before use; no `eval`.
- Clearing a bill, deleting a customer or starting a new day asks for confirmation.
- CSV export guards against spreadsheet formula injection in Katai names.

## Tested

Checked in headless Chromium and jsdom: all four sections open with no JavaScript errors; Zinda results match the original engine (all three labour slabs and their boundaries, jaal deduction, samiti rounding, ₹10 round-up, ledger, manual labour); Katai pages load no Zinda code; auto-save and reload; corrupt storage; search; add/delete; print; Excel/CSV; WhatsApp PDF generation; desktop and mobile layouts.
