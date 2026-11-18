# algotrading

Daily threshold-rebalancing paper-trading bot for NSE. The design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Setup

```bash
# Python (3.12, matches the Lambda runtime)
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# Serverless Framework v4 + python requirements plugin
npm install
```

## One-time AWS prerequisites

1. **Verify your email in SES:** in region `ap-south-1`, verify the address you will use as `NOTIFY_EMAIL`. In the SES sandbox, sender and recipient must both be verified; here they are the same address.
2. **Confirm the alerts subscription:** after the first deploy, confirm the SNS subscription email sent to `NOTIFY_EMAIL`.

## Deploy

```bash
NOTIFY_EMAIL=you@example.com npx serverless deploy
```

## Operate

```bash
# Add cash to the paper account
NOTIFY_EMAIL=you@example.com npx serverless invoke -f deposit --data '{"amount": 2000}'

# Run the quant job by hand (it stops if there was no NSE session today)
NOTIFY_EMAIL=you@example.com npx serverless invoke -f quant

# Lint / format
.venv/bin/ruff check src && .venv/bin/ruff format src
```

## Backtest (local)

```bash
.venv/bin/python -m backtest.run                       # 2010 → today, INR 5,000, drift 5, with charges + tax
.venv/bin/python -m backtest.run --initial 500000 --monthly-deposit 2000
.venv/bin/python -m backtest.run --monthly-deposit 5000 --policies fixed,trend --thresholds 5,10 --split 2022-07-01 --from 2018-05-11
.venv/bin/python -m backtest.run --costs none            # ignore charges and taxes
.venv/bin/python -m backtest.run --monthly-deposit 5000 --features none,routing,routing+harvest,all

# Pairs-trading research (daily, futures proxy, after costs + tax)
.venv/bin/python -m backtest.pairs --split 2019-01-01
.venv/bin/python -m backtest.pairs --pairs HDFCBANK.NS/ICICIBANK.NS

# Same-index ETF switching research (NIFTYBEES/NIFTY1, GOLDBEES/GOLD1)
.venv/bin/python -m backtest.etf_switch
.venv/bin/python -m backtest.etf_switch --from=2019-01-01 --thresholds 0.5,1.0
```

Results print as a table; CSVs go to `backtest/results/`.

To change target weights or the drift threshold, edit `config/portfolio.json` and redeploy.
