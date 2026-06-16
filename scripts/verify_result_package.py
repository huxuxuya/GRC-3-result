#!/usr/bin/env python3
"""Verify final GRC Proposal #3 result package consistency."""

from __future__ import annotations

import csv
import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NGONKA = Decimal("1000000000")
sys.dont_write_bytecode = True


EXPECTED = {
    "victim_payout_gonka": "70154.024668251",
    "role_payout_gonka": "50950.000000000",
    "proposal_total_gonka": "121104.024668251",
    "planned_amount_gonka": "99773.810455897",
    "overlap_adjustment_gonka": "29619.785787646",
    "p4_paid_overlap_gonka": "34944.788622168",
    "p4_overpaid_gonka": "5325.002834522",
    "metadata": "https://github.com/huxuxuya/GRC-3-result",
    "deposit": "500000000000ngonka",
}

EXPECTED_CASE_FINAL = {
    "P3-CAND-01": "35109.923355683",
    "P3-CAND-02": "1075.336150923",
    "P3-CAND-03": "10262.057515369",
    "P3-CAND-04": "23706.707646276",
}

CASE_05_INVESTIGATOR_ADDRESS = "gonka123pr0p0salv96xvne9qln70x3usvpyscug5f9a"


def load_json(path: str) -> dict:
    with (ROOT / path).open() as fh:
        return json.load(fh)


def amount_to_ngonka(value: str | int | None) -> int:
    if value in (None, ""):
        return 0
    whole_raw, _, frac_raw = str(value).strip().partition(".")
    whole = whole_raw or "0"
    frac = (frac_raw + "000000000")[:9]
    return int(whole) * 1_000_000_000 + int(frac)


def format_ngonka(value: int) -> str:
    whole, frac = divmod(int(value), 1_000_000_000)
    return f"{whole}.{frac:09d}"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_builder():
    path = ROOT / "scripts" / "build_final_proposal.py"
    spec = importlib.util.spec_from_file_location("build_final_proposal", path)
    require(spec is not None and spec.loader is not None, "cannot load builder script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_csv_against_settlement(settlement: dict) -> None:
    rows = []
    total_row = None
    with (ROOT / "data" / "planned_compensation_settlement.csv").open(newline="") as fh:
        for row in csv.DictReader(fh):
            if row["epoch"] == "TOTAL":
                total_row = row
            else:
                rows.append(row)

    require(total_row is not None, "CSV TOTAL row missing")
    require(len(rows) == settlement["totals"]["global"]["rows"], "CSV row count mismatch")

    sums = {
        "planned_amount_gonka": Decimal("0"),
        "p4_paid_overlap_gonka": Decimal("0"),
        "overlap_adjustment_gonka": Decimal("0"),
        "p4_overpaid_gonka": Decimal("0"),
        "final_payout_gonka": Decimal("0"),
    }
    by_case: dict[str, Decimal] = {}

    for row in rows:
        planned = Decimal(row["planned_amount_gonka"] or "0")
        p4_paid = Decimal(row["p4_paid_overlap_gonka"] or "0")
        overlap = Decimal(row["overlap_adjustment_gonka"] or "0")
        overpaid = Decimal(row["p4_overpaid_gonka"] or "0")
        final = Decimal(row["final_payout_gonka"] or "0")
        require(final == max(planned - p4_paid, Decimal("0")), f"bad final formula for {row['address']} epoch {row['epoch']}")
        require(overlap == min(planned, p4_paid), f"bad overlap adjustment for {row['address']} epoch {row['epoch']}")
        require(overpaid == max(p4_paid - planned, Decimal("0")), f"bad overpaid amount for {row['address']} epoch {row['epoch']}")
        for key, value in (
            ("planned_amount_gonka", planned),
            ("p4_paid_overlap_gonka", p4_paid),
            ("overlap_adjustment_gonka", overlap),
            ("p4_overpaid_gonka", overpaid),
            ("final_payout_gonka", final),
        ):
            sums[key] += value
        by_case[row["case_family"]] = by_case.get(row["case_family"], Decimal("0")) + final

    for key, value in sums.items():
        require(str(value.quantize(Decimal("0.000000001"))) == total_row[key], f"CSV TOTAL mismatch for {key}")
        require(total_row[key] == settlement["totals"]["global"][key], f"settlement global mismatch for {key}")

    for case_family, expected in EXPECTED_CASE_FINAL.items():
        require(str(by_case[case_family].quantize(Decimal("0.000000001"))) == expected, f"case final mismatch for {case_family}")


def verify_roles(role_config: dict) -> None:
    role_total = 0
    role_entries = 0
    case_05_investigator_entries = []
    for case_item in role_config["cases"]:
        for role_key, role_name in (("investigators", "investigator"), ("validators", "validator")):
            for person in case_item.get(role_key, []):
                amount = 0 if case_item.get("status") == "rejected_by_coordinator" else amount_to_ngonka(person.get("amount_gonka"))
                if amount > 0:
                    role_total += amount
                    role_entries += 1
                if person.get("address") == CASE_05_INVESTIGATOR_ADDRESS:
                    case_05_investigator_entries.append((case_item["case_family"], role_name, amount))
        person = case_item.get("organizer") or {}
        amount = 0 if case_item.get("status") == "rejected_by_coordinator" else amount_to_ngonka(person.get("amount_gonka"))
        if amount > 0:
            role_total += amount
            role_entries += 1

    require(format_ngonka(role_total) == EXPECTED["role_payout_gonka"], "role payout total mismatch")
    require(role_entries == 13, "role entry count mismatch")
    require(("P3-CAND-03", "validator", amount_to_ngonka("3100.000000000")) not in case_05_investigator_entries, "case 05 investigator is validator in case 3")
    require(("P3-CAND-04", "validator", amount_to_ngonka("3100.000000000")) not in case_05_investigator_entries, "case 05 investigator is validator in case 4")
    require(case_05_investigator_entries == [("P4-CAND-01", "investigator", amount_to_ngonka("4600.000000000"))], "unexpected case 05 investigator role entries")


def verify_proposal_artifacts(settlement: dict, role_config: dict) -> None:
    builder = load_builder()
    expected_proposal, expected_breakdown = builder.build_artifacts(settlement, role_config)
    proposal = load_json("proposal/proposal.json")
    breakdown = load_json("proposal/payout_breakdown.json")

    require(proposal == expected_proposal, "proposal/proposal.json does not match deterministic rebuild")
    require(breakdown == expected_breakdown, "proposal/payout_breakdown.json does not match deterministic rebuild")
    require(proposal["metadata"] == EXPECTED["metadata"], "proposal metadata URL mismatch")
    require(proposal["deposit"] == EXPECTED["deposit"], "proposal deposit mismatch")
    require(breakdown["totals"]["victim_payout_gonka"] == EXPECTED["victim_payout_gonka"], "victim payout total mismatch")
    require(breakdown["totals"]["role_payout_gonka"] == EXPECTED["role_payout_gonka"], "role payout total mismatch")
    require(breakdown["totals"]["proposal_total_gonka"] == EXPECTED["proposal_total_gonka"], "proposal total mismatch")
    require(breakdown["totals"]["victim_recipient_count"] == 40, "victim recipient count mismatch")
    require(breakdown["totals"]["role_entry_count"] == 13, "role entry count mismatch")
    require(breakdown["totals"]["role_message_count"] == 5, "role message count mismatch")
    require(len(proposal["messages"]) == 6, "proposal message count mismatch")
    require(proposal["messages"][0]["@type"] == "/inference.streamvesting.MsgBatchTransferWithVesting", "first proposal message is not victim vesting batch")
    community_recipients = [message["recipient"] for message in proposal["messages"][1:]]
    require(len(community_recipients) == len(set(community_recipients)), "community spend messages are not grouped by recipient")


def verify_readme() -> None:
    readme = (ROOT / "README.md").read_text()
    for text in (
        EXPECTED["victim_payout_gonka"],
        EXPECTED["role_payout_gonka"],
        EXPECTED["proposal_total_gonka"],
        "Case 01 | `@Op***on` investigated",
        "Case 02 | `@ma***ff` investigated",
        "Case 03 | `@mi***ov` investigated",
        "Case 04 | `@ma***ff` investigated",
        "Case 05 | `@v****n` published",
        "proposal/proposal.json",
        "proposal/payout_breakdown.json",
    ):
        require(text in readme, f"README missing {text}")
    require("t.me/c/" not in readme, "README contains private Telegram link")


def main() -> None:
    settlement = load_json("docs/data/settlement.json")
    role_config = load_json("docs/data/role_config.json")
    verify_csv_against_settlement(settlement)
    verify_roles(role_config)
    verify_proposal_artifacts(settlement, role_config)
    verify_readme()
    print("result package verification passed")


if __name__ == "__main__":
    main()
