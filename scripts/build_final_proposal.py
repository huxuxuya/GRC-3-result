#!/usr/bin/env python3
"""Build final chain-ready proposal artifacts from committed data files."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SETTLEMENT_PATH = ROOT / "docs" / "data" / "settlement.json"
ROLE_CONFIG_PATH = ROOT / "docs" / "data" / "role_config.json"
PROPOSAL_PATH = ROOT / "proposal" / "proposal.json"
BREAKDOWN_PATH = ROOT / "proposal" / "payout_breakdown.json"
NGONKA = 1_000_000_000


def amount_to_ngonka(value: str | int | None) -> int:
    if value in (None, ""):
        return 0
    whole_raw, _, frac_raw = str(value).strip().partition(".")
    whole = whole_raw or "0"
    frac = (frac_raw + "000000000")[:9]
    return int(whole) * NGONKA + int(frac)


def format_ngonka(value: int) -> str:
    whole, frac = divmod(int(value), NGONKA)
    return f"{whole}.{frac:09d}"


def gonka_address_ok(value: str) -> bool:
    return isinstance(value, str) and value.startswith("gonka1") and len(value) >= 40


def load_json(path: Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def role_people(case_item: dict) -> list[tuple[str, dict]]:
    people: list[tuple[str, dict]] = []
    people.extend(("investigator", person) for person in case_item.get("investigators", []))
    people.extend(("validator", person) for person in case_item.get("validators", []))
    people.append(("organizer", case_item.get("organizer") or {}))
    return people


def all_role_entries(role_config: dict) -> list[dict]:
    entries: list[dict] = []
    for case_item in role_config["cases"]:
        for role, person in role_people(case_item):
            amount = 0
            if case_item.get("status") != "rejected_by_coordinator":
                amount = amount_to_ngonka(person.get("amount_gonka", "0"))
            entries.append(
                {
                    "case_family": case_item["case_family"],
                    "role": role,
                    "name": person.get("name", ""),
                    "address": person.get("address", ""),
                    "amount_ngonka": str(amount),
                    "amount_gonka": format_ngonka(amount),
                    "comment": person.get("comment", ""),
                }
            )
    return entries


def build_victim_outputs(settlement: dict) -> tuple[list[dict], list[dict]]:
    by_address: dict[str, int] = {}
    breakdown: list[dict] = []
    for row in settlement["rows"]:
        amount = int(row["final_payout_ngonka"])
        if amount <= 0:
            continue
        by_address[row["address"]] = by_address.get(row["address"], 0) + amount
        breakdown.append(
            {
                "category": "victim",
                "case_family": row["case_family"],
                "epoch": row["epoch"],
                "address": row["address"],
                "amount_ngonka": str(amount),
                "amount_gonka": format_ngonka(amount),
                "source_row": row,
            }
        )
    outputs = [
        {
            "recipient": address,
            "amount": [{"denom": "ngonka", "amount": str(amount)}],
        }
        for address, amount in sorted(by_address.items())
    ]
    return outputs, breakdown


def build_artifacts(settlement: dict, role_config: dict) -> tuple[dict, dict]:
    invalid_roles = [
        entry
        for entry in all_role_entries(role_config)
        if int(entry["amount_ngonka"]) > 0 and not gonka_address_ok(entry["address"])
    ]
    if invalid_roles:
        details = ", ".join(f"{entry['case_family']} {entry['role']}" for entry in invalid_roles)
        raise ValueError(f"invalid non-zero role payout address: {details}")

    settings = role_config["settings"]
    outputs, victim_breakdown = build_victim_outputs(settlement)
    role_breakdown = [
        {"category": "role", **entry}
        for entry in all_role_entries(role_config)
        if int(entry["amount_ngonka"]) > 0
    ]
    role_messages = [
        {
            "@type": "/cosmos.distribution.v1beta1.MsgCommunityPoolSpend",
            "authority": settings["authority"],
            "recipient": entry["address"],
            "amount": [{"denom": "ngonka", "amount": entry["amount_ngonka"]}],
        }
        for entry in role_breakdown
    ]

    proposal = {
        "messages": [
            {
                "@type": "/inference.streamvesting.MsgBatchTransferWithVesting",
                "sender": settings["authority"],
                "outputs": outputs,
                "vesting_epochs": str(settings.get("vesting_epochs") or "150"),
            },
            *role_messages,
        ],
        "metadata": settings["metadata"],
        "deposit": settings["deposit"],
        "title": settings["title"],
        "summary": settings["summary"],
    }

    victim_total = sum(int(entry["amount_ngonka"]) for entry in victim_breakdown)
    role_total = sum(int(entry["amount_ngonka"]) for entry in role_breakdown)
    breakdown = {
        "totals": {
            "victim_payout_ngonka": str(victim_total),
            "victim_payout_gonka": format_ngonka(victim_total),
            "role_payout_ngonka": str(role_total),
            "role_payout_gonka": format_ngonka(role_total),
            "proposal_total_ngonka": str(victim_total + role_total),
            "proposal_total_gonka": format_ngonka(victim_total + role_total),
            "victim_recipient_count": len(outputs),
            "role_message_count": len(role_messages),
        },
        "entries": [*victim_breakdown, *role_breakdown],
    }
    return proposal, breakdown


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    settlement = load_json(SETTLEMENT_PATH)
    role_config = load_json(ROLE_CONFIG_PATH)
    proposal, breakdown = build_artifacts(settlement, role_config)
    write_json(PROPOSAL_PATH, proposal)
    write_json(BREAKDOWN_PATH, breakdown)
    print(f"wrote {PROPOSAL_PATH.relative_to(ROOT)}")
    print(f"wrote {BREAKDOWN_PATH.relative_to(ROOT)}")
    print(f"proposal_total_gonka={breakdown['totals']['proposal_total_gonka']}")


if __name__ == "__main__":
    main()
