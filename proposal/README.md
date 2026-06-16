# Proposal Artifacts

This directory contains the final chain-ready RC Proposal #3 payout artifacts.

| File | Purpose |
|---|---|
| [`proposal.json`](proposal.json) | Governance payload with victim vesting batch and committee/work payments. |
| [`payout_breakdown.json`](payout_breakdown.json) | Audit breakdown for every victim row and every committee/work role line. |

Totals:

- Victim restitution: `70154.024668251 GNK`
- Committee/work payout: `50950.000000000 GNK`
- Proposal total: `121104.024668251 GNK`

Regenerate from committed source data:

```sh
python3 scripts/build_final_proposal.py
python3 scripts/verify_result_package.py
```
