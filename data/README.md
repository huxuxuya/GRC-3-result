# Data Files

This directory contains the minimal machine-readable calculation layer used by
the public result package.

## Files

| File | Purpose |
|---|---|
| [`planned_compensation_settlement.csv`](planned_compensation_settlement.csv) | Per-address, per-epoch planned settlement rows after exact P4 overlap handling. |
| [`compensation_results.csv`](compensation_results.csv) | Compact case-level result ledger with status groups and tracked amounts. |

## Settlement Formula

The planned settlement uses exact same-address, same-epoch P4 deductions:

```text
final_payout = max(planned_amount - p4_paid_overlap, 0)
```

The `p4_overpaid_gonka` column records cases where the already-paid P4 amount
is larger than the planned amount for the same row. That excess is informational
and is not redistributed to other rows.

## Source

These CSV files were copied from:

<https://github.com/huxuxuya/GRC3>

Amounts are recorded as published result data. This repository does not rerun
third-party calculation scripts.
