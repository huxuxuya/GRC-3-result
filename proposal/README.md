# Proposal Artifacts

This directory contains the final chain-ready GRC Proposal #3 payout artifacts.

| File | Purpose |
|---|---|
| [`proposal.json`](proposal.json) | Governance payload with victim vesting batch and recipient-grouped committee/work payments. |
| [`payout_breakdown.json`](payout_breakdown.json) | Audit breakdown for every victim row and every committee/work role line. |

Totals:

- Victim restitution: `70154.024668251 GNK`
- Committee/work payout: `47850.000000000 GNK`
- Proposal total: `118004.024668251 GNK`

Regenerate from committed source data:

```sh
python3 scripts/build_final_proposal.py
python3 scripts/verify_result_package.py
```
