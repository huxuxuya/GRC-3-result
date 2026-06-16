# Gonka Proposal Launch Planner

Standalone static planner for choosing a proposal launch time so the vote ends
30-60 minutes before an epoch ends.

## Run

From the repository root:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/proposal-planner/
```

## Data Sources

The page reads live chain data from the configured node API:

- latest block: `/chain-api/cosmos/base/tendermint/v1beta1/blocks/latest`
- sample block for average block time: `/chain-api/cosmos/base/tendermint/v1beta1/blocks/{height}`
- epoch params: `/chain-api/productscience/inference/inference/params`
- gov voting params: `/chain-api/cosmos/gov/v1/params/voting`
- epoch validation: `/chain-api/productscience/inference/inference/epoch_group_data/{epoch}`

All calculations use UTC timestamps internally. The timezone input only changes
display and `datetime-local` interpretation.
