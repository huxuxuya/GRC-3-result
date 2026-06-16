# GRC-3 Result

Final public result package for RC Proposal #3. The repository contains the
review summary, settlement data, role/work payouts, and chain-ready JSON that
can be submitted to governance.

- Chain proposal payload: [`proposal/proposal.json`](proposal/proposal.json)
- Full payout audit: [`proposal/payout_breakdown.json`](proposal/payout_breakdown.json)
- Dashboard data: [`docs/data/settlement.json`](docs/data/settlement.json)
- Role/work payout config: [`docs/data/role_config.json`](docs/data/role_config.json)
- CSV settlement ledger: [`data/planned_compensation_settlement.csv`](data/planned_compensation_settlement.csv)
- Static dashboard: <https://huxuxuya.github.io/GRC-3-result/>

## Executive Summary

RC Proposal #3 closes the confirmed GRC3 restitution package and separates two
different payment classes:

| Payment class | Amount | Chain representation |
|---|---:|---|
| Committee-confirmed damage before overlap deductions | `99773.810455897 GNK` | Settlement basis, before already-paid P4 deductions |
| Victim restitution after exact P4 overlap deductions | `70154.024668251 GNK` | One `/inference.streamvesting.MsgBatchTransferWithVesting` message |
| Committee review, investigation, validation, coordination work, and proposal submission | `51450.000000000 GNK` | Five `/cosmos.distribution.v1beta1.MsgCommunityPoolSpend` messages |
| Total proposal spend | `121604.024668251 GNK` | `proposal/proposal.json` |

The committee/work amount is not an additional victim-damage claim. It is a
fixed work and bounty package for case investigation, independent validation,
additional review, reconciliation, and proposal coordination. Some addresses
receive multiple role lines because they completed multiple distinct tasks.

## Final Victim Settlement

The victim settlement uses exact same-address, same-epoch P4 overlap
deductions:

```text
final_payout = max(planned_amount - p4_paid_overlap, 0)
```

| Metric | Amount / Count |
|---|---:|
| Committee-confirmed damage before overlap deductions | `99773.810455897 GNK` |
| Exact P4 paid overlap | `34944.788622168 GNK` |
| Deducted from Proposal #3 payout | `29619.785787646 GNK` |
| P4 overpaid amount recorded for audit only | `5325.002834522 GNK` |
| Final victim payout | `70154.024668251 GNK` |
| Settlement rows | `47` |
| Unique planned recipients | `44` |
| Positive chain recipients after zeroed overlaps | `40` |
| Rows with exact P4 overlap | `7` |

Rows where P4 already paid more than the planned amount are floored at zero.
The excess is recorded in the audit data and is not moved to any other row.

## RC Case Review

| Case | Decision in this package | Final victim payout | Public evidence |
|---|---|---:|---|
| Case 01: High miss rate / devshard issue | Included. Seven rows are retained, including the manual-review row present in the current settlement data. | `35109.923355683 GNK` | [`huxuxuya/grc-p3-cand01`](https://github.com/huxuxuya/grc-p3-cand01) |
| Case 02: Settle-drop / negative balance | Included after independent review of the affected set. | `1075.336150923 GNK` | [`gonkavip/unclaimed`](https://github.com/gonkavip/unclaimed), [`Dolper/GRC-case-2-settle-dropped`](https://github.com/Dolper/GRC-case-2-settle-dropped) |
| Case 03: Failed cPoC / preserved Kimi shortfall | Included for epoch `267`; epoch `265` extension is retained in the ledger but zeroed by exact P4 overlap. | `10262.057515369 GNK` | [`gonkalabs/GRC-e267-kimi_shortfall`](https://github.com/gonkalabs/GRC-e267-kimi_shortfall), [`Dolper/GRC-Case-3-Epoch-267`](https://github.com/Dolper/GRC-Case-3-Epoch-267) |
| Case 04: UpgradeProtectionWindow / cPoC misfire | Included with exact P4 overlap deductions applied row by row. | `23706.707646276 GNK` | [`gonkavip/payout276`](https://github.com/gonkavip/payout276), [`huxuxuya/GRC3 validation`](https://github.com/huxuxuya/GRC3/tree/main/validations/P3-CAND-04-upgrade-protection-cpoc-misfire-epoch-276) |
| Case 05: Kimi restitution aggregate, epochs 265-276 | Rejected as one aggregate compensation claim. Used only as already-paid overlap evidence and as bounty-eligible work. | `0.000000000 GNK` | [`votkon/gonka-kimi-restitution`](https://github.com/votkon/gonka-kimi-restitution), [`huxuxuya 265 attack review`](https://huxuxuya.github.io/265-attack/) |

Private Telegram references are intentionally excluded from this public evidence
package.

## Committee Work Package

The role package compensates completed work, not the size of any one person's
claim. It covers investigation, validation, additional checks, attack review,
and coordination across the RC Proposal #3 package.

| Metric | Amount / Count |
|---|---:|
| Non-zero role lines | `13` |
| Total role/work payout | `51450.000000000 GNK` |
| Distinct payout addresses | `5` |

votkon is not a validator for Case 03 or Case 04. The validator role was
removed by committee vote. The only non-zero `votkon` role line in this package
is `4600.000000000 GNK` to
`gonka123pr0p0salv96xvne9qln70x3usvpyscug5f9a` for publishing the full-period
Kimi restitution calculation reviewed as Case 05. That role line is
bounty/work compensation for Case 05 review material and does not approve Case
05 as a victim payout.

The coordinator payout also includes a `500.000000000 GNK` proposal submission
fee. It is included in the role/work total and grouped into the coordinator's
community-pool spend message.

## Chain Payload

`proposal/proposal.json` is the submit-ready governance payload generated from
the committed source data. It contains:

- one victim vesting batch with `40` positive recipients;
- five committee/work `MsgCommunityPoolSpend` messages, grouped by recipient;
- `deposit`, `metadata`, `title`, and `summary` from
  [`docs/data/role_config.json`](docs/data/role_config.json).

`proposal/payout_breakdown.json` contains the full audit trail for every victim
row and every role payment included in the proposal total.

Regenerate and verify the package with:

```sh
python3 scripts/build_final_proposal.py
python3 scripts/verify_result_package.py
jq empty docs/data/settlement.json docs/data/role_config.json proposal/proposal.json proposal/payout_breakdown.json
```

## Verification Status

The verification script checks:

- CSV totals against `docs/data/settlement.json`;
- row-level overlap math with exact 9-decimal `ngonka` arithmetic;
- case totals for Case 01 through Case 04;
- role/work total and the final proposal total;
- that `votkon` is absent from validators for Case 03 and Case 04;
- that generated proposal artifacts match deterministic rebuild output;
- that this README includes the final totals and no private Telegram links.
