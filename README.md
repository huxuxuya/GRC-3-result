# GRC-3 Result

Concise public result package for the GRC3 compensation case review.

This repository keeps only the high-signal outcome layer: case findings,
calculation summaries, links to the investigator repositories, and a static
GitHub Pages dashboard.

- Web dashboard: <https://huxuxuya.github.io/GRC-3-result/>
- Source review repository used for this package:
  <https://github.com/huxuxuya/GRC3>
- Dashboard data: [`docs/data/settlement.json`](docs/data/settlement.json)
- CSV payout plan: [`data/planned_compensation_settlement.csv`](data/planned_compensation_settlement.csv)
- CSV result ledger: [`data/compensation_results.csv`](data/compensation_results.csv)

## Result Summary

Amounts are copied from the current `huxuxuya/GRC3` result set and are not
recalculated in this repository.

| Metric | Amount / Count | Notes |
|---|---:|---|
| Accepted Proposal #2 compensation total | `306,307.29 GNK` | Historical accepted total for `P2-C02`, `P2-C03`, and `P2-C04`; `P2-C01` was rejected. |
| Planned settlement source total | `99,773.810455897 GNK` | Planned source total for the current settlement view. |
| Exact P4 overlap adjustment | `29,619.785787646 GNK` | Deducted from planned rows where exact `epoch + address` P4 payment overlap exists. |
| Final victim payout after exact P4 overlap | `70,154.024668251 GNK` | Uses `final_payout = max(planned_amount - p4_paid_overlap, 0)`. |
| Planned settlement rows | `47` | From `planned_compensation_settlement.csv`. |
| Unique planned recipients | `44` | From `planned_compensation_settlement.csv`. |

## Main Case Table

| ID | Case | Epochs | Status | Short finding | Calculation / amount | Investigation source | Overlap / decision note |
|---|---|---:|---|---|---:|---|---|
| `P2-C01` | Inactive status mid-epoch | `247` | Rejected | Claim was reviewed during Proposal #2 preparation and not accepted. | `0 GNK` | Proposal #2 materials in the source review repo | No payout. |
| `P2-C02` | Preserver weight double-scaling / stuck `0.35x` | `249-253` | Accepted / compensated | Preserver weight was incorrectly scaled for affected participant/node pairs. | `30,318.50 GNK` | Proposal #2 materials in the source review repo | Included in accepted Proposal #2. |
| `P2-C03` | Epoch loss restitution | `248-250` | Accepted / compensated | Epoch-loss restitution package accepted in Proposal #2. | `217,612.83 GNK` | Proposal #2 materials in the source review repo | Historical total should not be mixed with open P3/P4 rows without deduplication. |
| `P2-C04` | API startup blocking issue | `254` | Accepted / compensated | API startup blocking caused reward loss for affected addresses. | `58,375.96 GNK` | Proposal #2 materials in the source review repo | Included in accepted Proposal #2. |
| `P3-CAND-01` | High miss rate / devshard issue | `272` | Pending estimate / ready for validation | Investigation found a high miss-rate pattern for six confirmed addresses plus one manual-review row. | `35,040.581153560 GNK` confirmed-six amount; `35,109.923355683 GNK` including manual-review row | [`huxuxuya/grc-p3-cand01`](https://github.com/huxuxuya/grc-p3-cand01) | Devshard/root-cause validation remains required before final acceptance. |
| `P3-CAND-02` | Negative coin balance / settle-drop | `1-274` | Locally validated / inclusion pending | Independent archive validation matched the published affected set of 19 miners. | `1,075.336150923 GNK` | [`gonkavip/unclaimed`](https://github.com/gonkavip/unclaimed) | No exact overlap with other current planned settlement rows. |
| `P3-CAND-03` | Failed cPoC / preserved Kimi validation shortfall | `265, 267` | Locally validated / eligibility disputed | Strict epoch `267` shortfall was validated; same claimant also has an epoch `265` extension candidate. | `31,158.584694469 GNK` recommended working total; strict epoch `267` is `10,262.057515369 GNK` | [`gonkalabs/GRC-e267-kimi_shortfall`](https://github.com/gonkalabs/GRC-e267-kimi_shortfall) | Epoch `265` extension exactly overlaps P4 for the same address and amount, so it is zeroed in the planned settlement if already paid by P4. |
| `P3-CAND-04` | UpgradeProtectionWindow / cPoC misfire | `276` | Pending estimate / revalidation required | Current source repo reports 19 affected miners; local validation matched an earlier higher CSV total, so the changed source needs revalidation. | `32,429.966254822 GNK` current source amount | [`gonkavip/payout276`](https://github.com/gonkavip/payout276) | Exact address+epoch overlaps with P4 are deducted in the planned settlement. |
| `P3-CAND-05` | `ml3` hardware re-registration | `263-283` focus around `269` | Scope decision required | Archive trace confirms node/weight transitions, but no compensable on-chain loss or formula is established. | `TBD / not calculated` | Validation notes in the source review repo | Kept as a scope item; not part of the payout plan. |
| `P3-CAND-06` | Pre-fix confirmation accounting / pass-weight but failed ratio | `262-276` | Gross candidate set / overlap review required | Replay and raw-stage checks produced a gross candidate set, but eligibility and overlap handling remain unresolved. | `120,822.324371792 GNK` gross before overlap | Detailed case notes in the source review repo | Excluded from the current settlement view. It overlaps Case 4 for at least one epoch `276` address. |
| `P4-CAND-01` | Kimi restitution / cPoC, nonce exclusion, ComputeGroupCap | `265-276` | Contested / not included as one GRC payout | Source aggregate is reproducible as a package, but the aggregate methodology and eligibility are disputed. | `946,509.925002 GONKA` source aggregate | [`votkon/gonka-kimi-restitution`](https://github.com/votkon/gonka-kimi-restitution) | Used here only for exact already-paid overlap adjustment, not as a final GRC3 payout. |

## Calculation Rule

The planned settlement applies exact same-address, same-epoch P4 deductions:

```text
final_payout = max(planned_amount - p4_paid_overlap, 0)
```

Rows where P4 already paid more than the planned amount are floored at zero;
the excess is recorded separately and is not carried into another row.

## Web Version

The `docs/` directory contains a static GitHub Pages dashboard copied from the
source review repository and retitled for this result package. It loads:

- [`docs/data/settlement.json`](docs/data/settlement.json) for victim payout
  rows, case totals, address totals, epoch totals, and overlap adjustments.
- [`docs/data/role_config.json`](docs/data/role_config.json) for optional
  investigator/validator/organizer payout export data.

For local review:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs
```
