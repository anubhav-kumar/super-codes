# Algo Trading Bot — Architecture (Source of Truth)

This document records **decided facts only**. Anything not yet decided is listed as "defined in a later phase", not as an option.

## 1. Purpose and Scope

- **What it is:** a personal, single-user, end-of-day (daily) algorithmic trading bot. It is not real-time, not intraday-decision, and not HFT.
- **v1 is paper trading only.** There is no real broker integration.
- **Market:** Indian equities on NSE, using Yahoo Finance `.NS` tickers (e.g. `NIFTYBEES.NS`).
- **Currency:** INR throughout.
- **Starting paper capital:** INR 5,000.
- **Out of scope for v1:**
  - real brokers
  - UI
  - multiple concurrent strategies
  - multiple accounts
  - withdrawals
  - taxes and transaction charges (reference research is in `taxes_and_charges.md`)

## 2. Trading Rules (System-Level)

These rules apply to every strategy:

- **Long-only.** No short selling, no leverage, no derivatives (futures/options).
- **Instruments:** stocks and ETFs only.
- **Whole shares only.** No fractional quantities.
- **Order type:** market orders only.
- **Sell before buy:** on any trading day, SELL orders are sent first. BUY orders are sent the same day, after the SELLs have filled.
- **Cash guard:** a BUY batch is checked against the actual available cash, which includes that morning's SELL proceeds, before it is sent (see §4.4).
- **Holding guard:** a SELL order never exceeds the quantity currently held.
- **No taxes or charges:** the system does not model brokerage, statutory charges, or capital gains tax.

## 3. Strategy v1 — Threshold Rebalancing

### 3.1 Configuration

`config/portfolio.json` defines the target allocation:

```json
{
  "drift_threshold_pct": 5,
  "targets": { "NIFTYBEES.NS": 50, "JUNIORBEES.NS": 20, "GOLDBEES.NS": 25, "CASH": 5 }
}
```

- `targets` maps each ticker, plus `CASH`, to a target percentage of total portfolio value.
- The targets must add up to exactly 100. If they don't, the run fails with an error.
- `CASH` is treated exactly like any other component.
- A held ticker that is not in `targets` has a target of 0%, so it is sold on the next rebalance.
- `drift_threshold_pct` is measured in **percentage points of total portfolio value**. With a 50% target and a threshold of 5, a rebalance triggers when the actual weight falls below 45% or rises above 55%.
- The tickers above are an example. The real basket is whatever the config file contains.

### 3.2 Algorithm

Runs inside the Quant System after each trading day's close.

1. **Total value** `V` = cash + Σ (held quantity × last close price).
2. **Actual weight** of each component = its value ÷ `V`. Cash is one of the components.
3. **Trigger:** if the actual weight of **any** component (including `CASH`) differs from its target by more than `drift_threshold_pct`, rebalance the **whole portfolio**. Otherwise, place no orders.
4. **Target quantity** for each ticker = `floor(V × target% ÷ last close)`. Whatever is left over stays in cash.
5. **Orders:**
   - If the target quantity is below the held quantity, create a SELL for the difference.
   - If it is above, create a BUY for the difference.
6. **BUY priority:** each BUY carries a priority. The ticker furthest below its target weight is first. If cash runs short when the BUYs are sent, the highest-priority BUYs are filled first (§4.4).

### 3.3 Deposits

- To invest more, add cash to the paper account with the `deposit` function (§4.5).
- A deposit gets no special treatment. It raises the `CASH` weight, and a rebalance follows only if that weight drifts past the threshold.

## 4. Subsystems

### 4.1 Broker Interface

The Quant System and Executor interact with the broker only through this interface. A real broker can replace the paper broker later without changing either.

| Operation | Returns / Does |
|---|---|
| `get_account()` | Available cash, plus each holding's ticker and quantity |
| `get_quotes(tickers)` | Last close price and that price's date, for each ticker |
| `send_orders(batch)` | Places a batch of orders |

### 4.2 Paper Broker (v1 implementation)

- **Price source:** Yahoo Finance via the `yfinance` library. yfinance is used **only** inside the paper broker.
- **State:** cash and holdings are stored in DynamoDB (§7).
- **`send_orders`:** sends an email listing the batch via SES, then marks the orders `SENT`.
- **Settlement:** `SENT` orders are settled (marked `FILLED`, with cash and holdings updated) whenever the paper broker is queried. The fill price follows §6.
- **Price not yet available:** if a fill price isn't available yet from Yahoo, the operation fails with a retryable error.
- **Not modelled:** Zerodha's restriction on immediately reusing proceeds from selling shares bought the previous day (T1 holdings).

### 4.3 Quant System

Runs once per weekday after market close. Steps, in order:

1. Call `get_account()`. For the paper broker, this also settles any outstanding `SENT` orders.
2. Call `get_quotes()` for every ticker that is held or in `targets`.
3. If the quote date is not today (exchange holiday), **stop**. No further steps run.
4. Mark any order still `PENDING` (never sent) as `EXPIRED`.
5. Run the strategy (§3.2).
6. Write the resulting orders to the Order Store with status `PENDING`.
7. Save the run report to S3.
8. Send the end-of-day summary email.

### 4.4 Executor and Broker Lambda

The Executor runs twice per trading day:

| Run | Time (IST) | Action |
|---|---|---|
| SELL run | 09:00 | Reads `PENDING` SELL orders and publishes them as one batch to the SQS `orders` queue. |
| BUY run | 09:30 | Reads `PENDING` BUY orders and publishes them as one batch to the SQS `orders` queue. |

- **Nothing to do:** if a run finds no orders, it stops.
- **Holidays:** the Executor does not detect exchange holidays.

The **Broker Lambda** consumes the `orders` queue:

- **SELL batch:** calls `send_orders`.
- **BUY batch:**
  1. If any of today's SELL orders is still `SENT` (not yet filled), fail with a retryable error so the message is retried later.
  2. Call `get_account()` to get the actual available cash, which includes the SELL proceeds.
  3. Apply the cash guard. Go through the BUYs in priority order, pricing each at the latest quote plus a 0.5% buffer. Reduce any BUY that doesn't fit to the most whole shares the remaining cash covers. If that is zero shares, mark the order `REJECTED`.
  4. Call `send_orders` with the remaining BUYs.
- **SELL batch holding guard:** before sending, each SELL is capped at the quantity held. A SELL for a ticker with nothing held is `REJECTED`.
- **Retries:** if a message fails, SQS makes it visible again after 5 minutes. After 6 failed attempts, the message goes to the dead-letter queue (DLQ).
- **Expected retries are not errors:** the Broker Lambda reports failed messages through SQS partial batch responses rather than throwing, so a normal wait for SELL fills doesn't trigger the Lambda error alarm.

### 4.5 Deposit Function

- A Lambda invoked manually, e.g. `serverless invoke -f deposit --data '{"amount": 2000}'`.
- It adds the amount to paper cash and appends a `DEPOSIT` entry to the ledger.

## 5. Order Lifecycle

| Status | Meaning |
|---|---|
| `PENDING` | Created by the Quant System; waiting for its Executor run. |
| `SENT` | Sent by the Broker Lambda; waiting to be filled. |
| `FILLED` | Filled at the price defined in §6. |
| `REJECTED` | Failed a guard (cash guard, holding guard, or no price available for the ticker). |
| `EXPIRED` | Never sent. Expired by the next Quant run. |

## 6. Paper Fill Model

| Side | Base price | Slippage (0.05%, against us) |
|---|---|---|
| SELL | Open price of the first session on or after the day the order was sent | `open × 0.9995` |
| BUY | Open price of the first 5-minute bar at or after the time the BUY batch was sent (normally 09:30 IST) | `price × 1.0005` |

- **Fill value** = fill price × quantity. No charges or taxes are applied.
- **Partial fills:** at settlement, a SELL is capped at the quantity held, and a BUY at what the cash covers at the fill price. If that leaves zero shares, the order is `REJECTED`.
- **Atomic settlement:** each fill is one DynamoDB transaction covering the order, cash, position and ledger, with conditions that prevent the same fill being applied twice.
- **Account seeding:** the paper account is created with INR 5,000 the first time it is accessed.

## 7. Data Model (DynamoDB)

| Table | Keys | Contents |
|---|---|---|
| `orders` | PK `orderDate` (date created), SK `orderId` | ticker, side, quantity, BUY priority, status, fill price, sent/filled timestamps |
| `portfolio` | PK `accountId`, SK `CASH` or `POS#<ticker>` | cash balance; per-position quantity and average cost |
| `ledger` | PK `accountId`, SK `<ISO timestamp>#<ref>` | append-only record of every fill and deposit |

- The `orders` table has a global secondary index `status-index` (PK `status`, SK `orderId`) for finding `PENDING` and `SENT` orders across dates.
- `orderId` is deterministic (`<orderDate>#<ticker>#<side>`), so re-running the Quant System never creates duplicate orders.
- The `portfolio` `CASH` record starts at INR 5,000.

## 8. Storage (S3)

- **Run report per Quant run:** `reports/date=YYYY-MM-DD/report.json`. It contains the weights before the rebalance, the drift per component, whether a rebalance triggered, the orders created, and the portfolio state.
- S3 is for audit and history only.

## 9. Schedule

NSE trading hours are 09:15–15:30 IST. All schedules use EventBridge Scheduler in the `Asia/Kolkata` timezone and run Monday to Friday only.

| Job | Time (IST) | Time (SGT) |
|---|---|---|
| Executor — SELL run | 09:00 | 11:30 |
| Executor — BUY run | 09:30 | 12:00 |
| Quant System | 18:30 | 21:00 |

## 10. Notifications

All email goes through Amazon SES to the owner's verified address.

- **Order emails** (from the Broker Lambda): one per batch sent (SELL batch, BUY batch).
- **End-of-day email** (from the Quant System): fills, rejections, the weights against their targets, positions, cash, and P&L.
- **P&L** = total portfolio value − net deposits (initial capital plus all deposits).
- **Failure alerts:** CloudWatch alarms on errors from the Quant, Executor and Broker Lambdas, and on any message in the DLQ, send an email via SNS.
- **Email address:** the `NOTIFY_EMAIL` environment variable at deploy time sets the SES sender, the SES recipient, and the SNS alert subscription.

## 11. Technology Stack

| Area | Choice |
|---|---|
| Language | Python 3.12 for all Lambdas |
| Market data | `yfinance`, used only inside the paper broker. pandas is present only as a transitive dependency of `yfinance`; its output is converted to plain Python structures immediately, and the codebase does not use pandas or numpy directly. |
| Infrastructure as code | Serverless Framework v4, one service in this repository |
| AWS services | Lambda, SQS (+ DLQ), DynamoDB, S3, EventBridge Scheduler, SES, SNS, CloudWatch |
| AWS region | `ap-south-1` (Mumbai) |
| Stages | Single stage: `dev` |

## 12. Code Structure

```
algotrading/
├── ARCHITECTURE.md
├── README.md                   # setup, deploy, operate
├── taxes_and_charges.md
├── serverless.yml
├── package.json                # Serverless Framework v4 + serverless-python-requirements
├── requirements.txt            # runtime dependencies (deployed as a Lambda layer)
├── requirements-dev.txt        # local-only tools (ruff, boto3)
├── config/
│   └── portfolio.json          # targets + drift threshold
├── backtest/                   # local backtesting (§13); not deployed
│   ├── run.py                  # CLI
│   ├── data.py                 # yfinance history + local cache + glitch cleaning
│   ├── simulator.py            # in-memory day-by-day simulation
│   ├── metrics.py              # CAGR, XIRR, drawdown, volatility
│   ├── signals.py              # crossover signals + dynamic weights
│   ├── tier1.py                # deposit routing, partial rebalancing, tax harvesting
│   ├── costs.py / costs.json   # charges + capital gains tax
│   ├── pairs.py                # research tool: daily futures pairs-trading backtest
│   └── etf_switch.py           # research tool: same-index ETF switching / deposit routing
└── src/
    ├── handlers/               # Lambda entry points: parse event → call core → return
    │   ├── quant.py            # 18:30 run
    │   ├── executor.py         # 09:00 / 09:30 runs (side passed in the schedule event)
    │   ├── broker.py           # SQS consumer: holding/cash guards + send_orders
    │   └── deposit.py          # manual invoke
    ├── strategy/
    │   └── rebalance.py        # pure: (account, quotes, config) → orders. No I/O.
    ├── brokers/
    │   ├── base.py             # Broker interface: get_account, get_quotes, send_orders
    │   ├── factory.py          # picks implementation from env var BROKER=paper
    │   └── paper/
    │       ├── broker.py       # PaperBroker: settlement, fills, deposit
    │       └── prices.py       # the only module that imports yfinance
    ├── store/                  # DynamoDB access, one module per table
    │   ├── dynamo.py           # shared client, serialization, transactions
    │   ├── orders.py
    │   ├── portfolio.py
    │   └── ledger.py
    ├── notify/
    │   └── email.py            # SES send + message formatting
    ├── reports.py              # S3 run report
    ├── models.py               # Order, Holding, Account, Quote, enums
    ├── clock.py                # IST time helpers
    └── config.py               # load + validate portfolio.json, env vars
```

**Conventions**

| Area | Decision |
|---|---|
| Data models | Standard-library `dataclasses` |
| Money and prices | `Decimal`. Cash is rounded to 2 decimal places, prices to 4. |
| Broker interface | Abstract base class (`abc.ABC`) |
| Dependencies | One shared Lambda layer built by `serverless-python-requirements`. pip is pinned to Linux arm64 wheels, so no Docker is needed. |
| Lambda architecture | arm64 (Graviton) |
| Config | `config/portfolio.json` is bundled with the deployed code and tracked in git. Changing it requires a redeploy. |
| Local development | `.venv` with `requirements.txt` + `requirements-dev.txt`; `serverless invoke local` against the `dev` AWS resources |
| Lint/format | `ruff` |
| Tests | None in v1 |
| Email format | Plain text with aligned tables |
| Logging | Standard-library `logging` to CloudWatch |
| Timezone | IST is a fixed UTC+05:30 offset (India has no daylight saving) |

## 13. Backtesting

Backtesting runs **locally only**. It is not deployed to AWS.

- **Same algorithm as production:** it imports the production strategy (`src/strategy/rebalance.py`) unchanged, so the strategy under test is exactly the one that trades.
- **Command:** `.venv/bin/python -m backtest.run`. Options: `--from`, `--to`, `--split`, `--initial`, `--monthly-deposit`, `--slippage-pct`, `--costs`, `--thresholds`, `--policies`, `--steps`, `--sma-pairs`, `--max-weight`, `--benchmark`, `--refresh`, `--config`. Each list option runs every combination.

**Data**
- Daily prices from yfinance, **adjusted for splits and dividends**.
- Prices are cached in `backtest/data/` (git-ignored). `--refresh` downloads them again.
- **Glitch cleaning:** a run of up to 5 sessions whose open or close sits more than 35% from the last good close, and which then reverts, is dropped as bad data. A jump that does not revert is kept and printed as a warning.
- **Common sessions only:** the simulation uses only sessions where every ticker has data.

**Simulation**
- Each session, the strategy runs after the close. Its orders fill at the next session's open: SELLs first, then BUYs by priority, using the same-day sale proceeds.
- Both sides fill at the open with 0.05% slippage against us. This differs from live, where BUYs fill at the 09:30 five-minute bar; Yahoo keeps 5-minute bars for only about 60 days, so that price can't be reproduced historically.
- The holding guard and cash guard apply, as in live trading.
- An optional fixed monthly deposit is added on the first session of each month.
- Charges and capital gains tax are applied by default (§13.2). `--costs none` disables both; `--costs charges` keeps charges only.

**Defaults**
- Period: 2010-01-01 to today.
- Initial capital: INR 5,000.
- Drift thresholds compared: 2, 3, 5, 7 and 10 points.

**Runs compared**
- The strategy at each drift threshold.
- Buy-and-hold of the target weights (bought once, never rebalanced; deposits invested at target weights).
- 100% of a benchmark ticker (default `NIFTYBEES.NS`).

**Metrics**
- Time-weighted return, so deposits are excluded from the return calculation.
- CAGR, XIRR (money-weighted return on the actual deposits), total return, maximum drawdown, annualized volatility, number of rebalances and number of trades.
- Equity and trade CSVs are written to `backtest/results/` (git-ignored).

### 13.1 Dynamic Weights (Backtest Only)

The backtest can vary target weights with moving-average crossovers. **This is not part of the deployed system.**

- **Option:** `--policies fixed,contrarian,trend` (default `fixed`).
  - `contrarian`: a golden cross cuts that ticker's weight by `--step` points (default 5); a death cross raises it.
  - `trend`: the reverse. A golden cross raises the weight; a death cross cuts it.
- **Signals:**
  - Golden cross: the `--sma-fast`-day simple moving average of closes (default 50) crosses above the `--sma-slow`-day average (default 200).
  - Death cross: it crosses below.
  - Averages are computed from each ticker's full price history.
- **Redistribution:**
  - The points moved are taken from, or given to, the other tickers in proportion to their current weights.
  - `CASH` never changes.
  - Each ticker stays between 0% and `--max-weight` (default 40). A change that would break a limit is reduced to fit.
- **Starting point:** `config/portfolio.json` provides the starting weights.
- **Rebalancing:** a weight change forces a rebalance to the new targets on that day's close.
- **Output:** weight changes are written to `backtest/results/weights_<run>.csv`.

### 13.2 Charges and Taxes (Backtest Only)

Rates and instrument classifications live in `backtest/costs.json`, sourced from `taxes_and_charges.md`. They are re-verified before any results are relied on.

**Charges** (deducted from cash on each trade)
- STT, by instrument type: equity ETF 0.001% on the sell side; none on non-equity ETFs.
- Exchange fee, SEBI fee and IPFT.
- Stamp duty, on the buy side only.
- 18% GST on (brokerage + exchange fee + SEBI fee + IPFT).
- A flat DP charge of INR 15.34 per ticker per sell day.

**Tax categories** (per ticker)

| Category | Tickers | Short-term rate | Long-term rate |
|---|---|---|---|
| `EQUITY` | NIFTYBEES, JUNIORBEES | 20% | 12.5% after more than 12 months, INR 1.25 lakh yearly exemption |
| `NON_EQUITY` | MON100, GOLDBEES, SILVERBEES | Slab rate | 12.5% after more than 12 months |
| `DEBT` | LTGILTBEES | Slab rate | Slab rate (always treated as short term) |

- The slab rate is a config value, default 30%.

**Computing the gain**
- Lots are matched oldest first (FIFO).
- STT is excluded from both cost and sale value. All other charges are included.

**Netting per financial year (April–March)**
- Short-term losses offset any gains, highest tax rate first.
- Long-term losses offset only long-term gains.
- Unused losses carry forward. Their 8-year expiry is not modelled.
- 4% cess is added on top. Surcharge and the section 87A rebate are not modelled.

**Paying the tax**
- Each financial year's tax is deducted from cash on the first session of the next financial year.
- On the backtest's last day, tax for the year in progress is also settled.
- Unrealized gains are never taxed. This flatters strategies that rarely sell, such as buy-and-hold.

### 13.3 Out-of-Sample Testing

- `--split YYYY-MM-DD` simulates every run twice, each starting from the initial capital:
  - in-sample: [`--from`, split)
  - out-of-sample: [split, `--to`]
- It then prints both rankings by XIRR, and where the best in-sample run lands out of sample.
- Purpose: a parameter choice is trusted only if it also holds up on the period it was not chosen on.

### 13.4 Tier 1 Features (Backtest Only)

`--features` takes a comma list of feature sets, each joined with `+`. Values: `none`, `routing`, `partial`, `harvest`, `all`. Example: `none,routing,routing+harvest`. The logic is in `backtest/tier1.py`.

- **`routing`: deposit routing**
  - On a deposit day, cash above the `CASH` target buys the most underweight tickers, in proportion to their shortfall from target.
  - It never sells.
  - On other days, normal threshold rebalancing applies.
- **`partial`: partial rebalancing**
  - Only components outside the drift band are traded.
  - They go back to halfway inside the band (target ± threshold/2), not all the way to target.
  - `CASH` outside the band is corrected by buying the most underweight holdings or selling the most overweight ones.
- **`harvest`: tax harvesting**, once per financial year, on the first session on or after March 15. Orders fill at the next session's open.
  - **Loss harvesting:** for each ticker, sell and immediately rebuy the oldest-first (FIFO) portion of the holding whose sale realizes the largest net loss, if that loss is at least INR 1,000.
  - **LTCG harvesting:** for `EQUITY` tickers, sell and immediately rebuy oldest-first long-term units, realizing gains up to the remaining INR 1.25 lakh yearly exemption, if at least INR 1,000.
  - The strategy does not rebalance on a harvest day.
- **After-tax liquidation XIRR:** the XIRR if every holding were sold at the last close and that year's tax paid. It compares strategies that defer tax fairly against those that don't.

## 14. Flow Summary

```
[18:30 IST] Quant Lambda
    get_account (paper: settle SENT orders) → get_quotes → holiday check
    → expire stale PENDING → rebalance check → write PENDING SELL/BUY orders
    → report (S3) → EOD email (SES)

[09:00 IST] Executor (SELL run) → SQS "orders" → Broker Lambda
    send SELLs → email → mark SENT

[09:30 IST] Executor (BUY run) → SQS "orders" → Broker Lambda
    wait for today's SELLs to fill (retry via SQS) → get_account
    → cash guard by priority → send BUYs → email → mark SENT

[manual] Deposit Lambda → add cash → ledger DEPOSIT entry

Failures: retries exhausted → DLQ → CloudWatch alarm → SNS email
```
