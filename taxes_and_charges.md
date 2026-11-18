# Taxes and Charges — Research Notes (India, Equity Delivery)

**Status:** reference only. **Not implemented in v1.** `ARCHITECTURE.md` excludes all taxes and charges.

- **Researched:** 2026-11-12.
- **Sources:** mostly broker help pages and tax blogs, plus some official Income Tax Department pages. Each source is labelled **[Official]**, **[Broker]**, or **[Secondary]**.
- **Before implementing**, re-check every rate against the official source. Get a tax professional to confirm any position marked *disputed*.

---

## 1. Applicable Law

- The **Income-tax Act, 2025** replaced the Income-tax Act, 1961 from **2026-04-01**. Section numbers changed. Most guidance online still cites the old numbers.

| Topic | Old section (1961 Act) | New section (2025 Act) |
|---|---|---|
| Capital gains charge | 45 | 67 |
| Computation of capital gains (incl. STT bar) | 48 | 72 |
| STCG on listed equity | 111A | 196 |
| LTCG (other assets) | 112 | 197 |
| LTCG on listed equity | 112A | 198 |

- The mapping comes from [Secondary] sources, which mostly agree. One source describes a restructure into a schedule instead. The mapping still needs verifying against the Act text.
- **Rates are unchanged** for FY 2026-27. Budget 2026 kept the equity capital gains rates the same ([Business Standard](https://www.business-standard.com/budget/news/budget-2026-ltcg-tax-rates-unchanged-for-fy27-fm-sitharaman-126020100424_1.html)).

## 2. Capital Gains Tax — Listed Equity Shares and Equity ETFs

Applies to equity shares listed on a recognised exchange and to equity-oriented ETFs (e.g. `NIFTYBEES`, `JUNIORBEES`), when STT has been paid.

| Item | Value | Notes |
|---|---|---|
| Short-term threshold | Held **12 months or less** | |
| Long-term threshold | Held **more than 12 months** | Selling exactly on the 12-month anniversary is short term. |
| STCG rate (old 111A / new 196) | **20%** | Raised from 15% to 20% from 2024-07-23 (Budget 2024). Not 25%. |
| LTCG rate (old 112A / new 198) | **12.5%** | Raised from 10% to 12.5% from 2024-07-23. |
| LTCG annual exemption | **INR 1,25,000** per financial year | Applies to aggregate LTCG on listed equity, equity MFs and equity ETFs. Tax is due only on LTCG above this amount. |
| Surcharge | Capped at **15%** on these gains | Applies only above income thresholds. Irrelevant at our scale. |
| Health & Education Cess | **4%** on (tax + surcharge) | |
| Financial year | 1 April – 31 March | |

Sources: [TaxGarden](https://taxgarden.in/blog/income-tax-on-sale-of-listed-shares-stcg-ltcg-india-ay-2026-27), [MyAtFinance](https://www.myatfinance.com/blog/mutual-fund-capital-gains-tax-rules-2026), [Business Standard](https://www.business-standard.com/budget/news/budget-2026-ltcg-tax-rates-unchanged-for-fy27-fm-sitharaman-126020100424_1.html) — all [Secondary].

### 2.1 Section 87A Rebate (Disputed)

- **LTCG:** the 87A rebate cannot reduce tax on LTCG under old 112A. The statute bars it expressly (112A(6)).
- **STCG:** whether the rebate can reduce tax on STCG under old 111A is **disputed**.
  - Several ITAT benches have allowed it.
  - The Revenue disallows it, relying on the Finance Bill 2025 memorandum and Circular 13/2025.
- Sources: [Taxmann](https://www.taxmann.com/post/blog/rebate-u-s-87a-allowed-on-stcg-taxed-under-section-111a) [Secondary].
- **Modelling choice:** ignore the rebate and compute the gross tax.

## 3. Capital Gains Tax — Gold ETFs (e.g. `GOLDBEES`)

Gold ETFs are **non-equity** assets and are taxed differently from equity.

| Item | Value |
|---|---|
| Long-term threshold | Held **more than 12 months** (for listed gold ETF units, since 2024-07-23) |
| STCG | Taxed at the investor's **income-tax slab rate**, not 20% |
| LTCG | **12.5%**, no indexation |
| LTCG INR 1.25 lakh exemption | **Not applicable**. It applies to equity only. |
| Cess | 4% |

- **Unresolved:** a reader comment disputes the 12.5% LTCG treatment, and some pages give 24 months. Those pages refer to gold mutual funds and physical gold, not listed ETFs.
- Sources: [IIFL](https://www.iifl.com/index.php/blogs/gold-loan/gold-etf-tax-in-india-2026-post-finance-act-2024-rules), [Zerodha Fund House](https://www.zerodhafundhouse.com/blog/understanding-etf-taxation-in-india-a-simplified-guide-in-2025/), [Basunivesh](https://www.basunivesh.com/taxation-of-gold-and-silver-in-india-in-2026-explained-simply/) [Secondary].

**Implication:** each ticker needs a **tax category** (`EQUITY` or `NON_EQUITY`) in config.

## 4. Computing the Gain

### 4.1 Lot Matching — FIFO

- For securities held in demat form, the period of holding and the cost are determined **first-in, first-out (FIFO)**, separately for **each demat account**.
- Source: CBDT Circular 768 dated 1998-06-24 ([Income Tax Department](https://www.incometaxindia.gov.in/w/768-circular-no.-768-dated-24-6-1998-1) [Official]; [TaxGuru summary](https://taxguru.in/income-tax/circular-768income-tax-dated-2461998.html)).
- **Holding-period start:** under the related Circular 704, the holding period counts from the **contract note (trade) date**, not the date the shares are credited to the demat account.
- **Implication:** track every BUY as a separate **tax lot** (ticker, buy date, quantity, cost). A SELL consumes the oldest lots first.

### 4.2 Cost and Sale Value

- **Capital gain** = Sale value − Transfer expenses − Cost of acquisition.
- **STT is never deductible**, on either the buy or the sell side.
  - Source: proviso to old Section 48 ([Income Tax Department](https://www.incometaxindia.gov.in/w/section-48-64) [Official]).
- **Other transfer costs are deductible:** brokerage, stamp duty, exchange charges, SEBI fee, GST on these, and DP charges.
  - Buy-side costs go into the cost of acquisition. Sell-side costs are deducted from the sale value.
  - Sources: [Geojit](https://support.geojit.com/support/solutions/articles/89000006872-what-expenses-can-be-claimed-on-the-sale-of-shares-when-income-is-classified-as-capital-gains-) [Broker], [Outlook Money](https://www.outlookmoney.com/tax/stt-paid-on-shares-is-not-accounted-for-while-calculating-capital-gains) [Secondary].

## 5. Set-off and Carry-forward of Losses

| Loss type | Can be set off against |
|---|---|
| Short-term capital loss (STCL) | STCG **or** LTCG |
| Long-term capital loss (LTCL) | LTCG **only** |
| Any capital loss | Never against salary, business or other income |

- **Order of set-off:** within a financial year, set off losses first, then apply the INR 1.25 lakh LTCG exemption to the net LTCG.
- **Carry-forward:** unabsorbed capital losses can be carried forward for **8 assessment years**, only if the ITR is filed by the due date.
- Sources: [Taxmann FAQ](https://www.taxmann.com/post/blog/faqs-income-tax-returns-itr-set-off-and-carry-forward-of-losses-under-income-tax-act-house-property-capital-loss), [m.Stock](https://www.mstock.com/articles/short-term-vs-long-term-capital-loss-set-off-carry-forward) [Secondary].

## 6. Transaction Charges — Equity Delivery (Zerodha Reference)

Rates are from Zerodha's charges page ([zerodha.com/charges](https://zerodha.com/charges/) [Broker]), retrieved 2026-11-12. Other brokers differ on brokerage and DP charges. Statutory charges (STT, stamp duty, SEBI fee, GST) are the same everywhere.

| Charge | Rate | Side | Notes |
|---|---|---|---|
| Brokerage | **INR 0** | Both | Retail individuals. |
| STT — equity shares | **0.1%** of turnover | Buy **and** sell | Statutory. |
| STT — equity ETFs | **0.001%** of turnover | Sell only | Per Zerodha support ([link](https://support.zerodha.com/category/account-opening/charges-at-zerodha/articles/stt-etfs)). |
| STT — gold / liquid / gilt ETFs | **Not applicable** | — | Per Geojit and Tradejini ([link](https://support.geojit.com/support/solutions/articles/89000007838-is-securities-transaction-tax-stt-levied-on-etfs-)). |
| Exchange transaction charge (NSE) | **0.00307%** of turnover | Both | |
| SEBI turnover fee | **INR 10 per crore** (0.0001%) | Both | |
| IPFT (NSE) | **INR 0.01 per crore** | Both | Negligible. |
| Stamp duty | **0.015%** (INR 1,500 per crore) | Buy only | |
| GST | **18%** on (brokerage + exchange charge + SEBI fee) | Both | GST does not apply to STT or stamp duty. |
| DP charge | **INR 15.34** per scrip per sell day | Sell only | INR 3.50 CDSL + INR 9.50 Zerodha + INR 2.34 GST. Flat, regardless of quantity. |

### 6.1 Worked Example (Illustrative)

- **Trade:** sell INR 1,000 of an equity share on Zerodha.
- **Charges:**
  - STT: INR 1.00
  - Exchange charge: INR 0.03
  - SEBI fee: about INR 0.00
  - GST: about INR 0.01
  - DP charge: INR 15.34
- **Total:** about **INR 16.38**, or roughly **1.6%** of the trade value.
- **Lesson:** the flat DP charge dominates small trades. At INR 5,000 capital, sell orders should have a minimum size.

## 7. Other Items Noted

- **Buybacks (Budget 2026):** buyback proceeds are now taxed as capital gains (STCG/LTCG by holding period) instead of as dividends ([Business Standard](https://www.business-standard.com/budget/news/budget-2026-buyback-proceeds-to-be-treated-as-capital-gains-126020101050_1.html) [Secondary]).
  - This is irrelevant unless the system holds a stock through a buyback.
- **Budget 2026 STT increase:** applied to derivatives and commodities, not equity delivery.

## 8. Config Shape for a Future Implementation

When taxes and charges are added, these values should be configurable:

- **Per tax category** (`EQUITY`, `NON_EQUITY`):
  - long-term holding threshold (months)
  - STCG rate (or a slab-rate value for `NON_EQUITY`)
  - LTCG rate
  - LTCG annual exemption
- **Global:**
  - cess rate
  - financial-year start month
- **Per instrument type** (equity share, equity ETF, non-equity ETF):
  - STT buy rate and STT sell rate
- **Global charges:**
  - exchange charge rate
  - SEBI fee rate
  - IPFT rate
  - stamp duty rate
  - GST rate and its base
  - DP charge per scrip per sell day
  - brokerage (flat per order and/or percentage, with cap)
