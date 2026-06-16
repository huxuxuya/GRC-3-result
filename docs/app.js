const NGONKA = 1000000000n;
const STORAGE_KEY = "grc3_role_config";
const CASE_LABELS = {
  "P3-CAND-01": "Case 01",
  "P3-CAND-02": "Case 02",
  "P3-CAND-03": "Case 03",
  "P3-CAND-04": "Case 04",
  "P4-CAND-01": "Case 05",
};
let settlement;
let roleConfig;

const $ = (id) => document.getElementById(id);

function amountToBigInt(value) {
  if (value === undefined || value === null || value === "") return 0n;
  const [wholeRaw, fracRaw = ""] = String(value).trim().split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const frac = (fracRaw + "000000000").slice(0, 9);
  return BigInt(whole) * NGONKA + BigInt(frac);
}

function formatNgonka(value) {
  const amount = BigInt(value || 0);
  const whole = amount / NGONKA;
  const frac = String(amount % NGONKA).padStart(9, "0");
  return `${whole}.${frac}`;
}

function shortAddress(address) {
  if (!address || address.length < 18) return address;
  return `${address.slice(0, 12)}...${address.slice(-8)}`;
}

function displayCase(caseFamily) {
  return CASE_LABELS[caseFamily] || caseFamily;
}

function maskName(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  const at = value.startsWith("@");
  const raw = at ? value.slice(1) : value;
  if (raw.includes(" / ")) {
    return raw.split(" / ").map((part) => maskName(part)).join(" / ");
  }
  if (raw.length <= 4) return `${at ? "@" : ""}${raw[0] || ""}***`;
  return `${at ? "@" : ""}${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function gonkaAddressOk(value) {
  return typeof value === "string" && value.startsWith("gonka1") && value.length >= 40;
}

function renderSummary() {
  const total = settlement.totals.global;
  const cards = [
    ["Confirmed damage", total.planned_amount_gonka],
    ["Already paid by P4", total.p4_paid_overlap_gonka],
    ["Deducted from payout", total.overlap_adjustment_gonka],
    ["Final victim payout", total.final_payout_gonka],
    ["Rows", total.rows],
    ["Recipients", total.address_count],
    ["Overlap rows", total.overlap_rows],
    ["Cases shown", settlement.metadata.display_case_families.length],
  ];
  $("summary").innerHTML = cards
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function fillFilters() {
  const cases = ["all", ...settlement.metadata.display_case_families];
  $("case-filter").innerHTML = cases.map((item) => `<option value="${item}">${item === "all" ? "All" : displayCase(item)}</option>`).join("");
  const epochs = ["all", ...new Set(settlement.rows.map((row) => row.epoch).sort((a, b) => a - b))];
  $("epoch-filter").innerHTML = epochs.map((item) => `<option value="${item}">${item === "all" ? "All" : item}</option>`).join("");
}

function rowVisible(row) {
  const caseFilter = $("case-filter").value;
  const epochFilter = $("epoch-filter").value;
  const overlapFilter = $("overlap-filter").value;
  const addressFilter = $("address-filter").value.trim().toLowerCase();
  if (caseFilter !== "all" && row.case_family !== caseFilter) return false;
  if (epochFilter !== "all" && String(row.epoch) !== epochFilter) return false;
  if (addressFilter && !row.address.toLowerCase().includes(addressFilter)) return false;
  const hasOverlap = BigInt(row.p4_paid_overlap_ngonka) > 0n;
  const hasFinal = BigInt(row.final_payout_ngonka) > 0n;
  if (overlapFilter === "overlap" && !hasOverlap) return false;
  if (overlapFilter === "remaining" && !hasFinal) return false;
  if (overlapFilter === "zero" && hasFinal) return false;
  return true;
}

function filteredRows() {
  return settlement.rows.filter(rowVisible);
}

function renderRows() {
  $("rows-body").innerHTML = filteredRows()
    .map((row) => {
      const overlap = BigInt(row.p4_paid_overlap_ngonka) > 0n;
      const zero = BigInt(row.final_payout_ngonka) === 0n;
      return `<tr class="${overlap ? "overlap" : ""}">
        <td>${row.epoch}</td>
        <td class="mono" title="${row.address}">${shortAddress(row.address)}</td>
        <td><span class="badge" title="${row.case_family}">${displayCase(row.case_family)}</span></td>
        <td>${row.case_track}</td>
        <td class="num">${row.planned_amount_gonka}</td>
        <td class="num">${row.p4_paid_overlap_gonka}</td>
        <td class="num">${row.overlap_adjustment_gonka}</td>
        <td class="num ${zero ? "zero" : ""}">${row.final_payout_gonka}</td>
        <td>${row.comment}</td>
      </tr>`;
    })
    .join("");
}

function filterSummaryItems(items, keys) {
  const visible = new Set(filteredRows().map((row) => keys.map((key) => row[key]).join("|")));
  return items.filter((item) => visible.has(keys.map((key) => item[key]).join("|")));
}

function renderSummaryTable(bodyId, items, columns) {
  $(bodyId).innerHTML = items
    .map((item) => `<tr>
      ${columns.map((column) => column.render(item)).join("")}
    </tr>`)
    .join("");
}

function renderAggregates() {
  const visibleRows = filteredRows();
  const selectedCase = $("case-filter").value;
  const visibleAddressKeys = new Set(visibleRows.map((row) => row.address));
  const visibleEpochKeys = new Set(visibleRows.map((row) => String(row.epoch)));
  const visibleCaseEpochKeys = new Set(visibleRows.map((row) => `${row.case_family}|${row.epoch}`));
  const visibleCaseKeys = new Set(visibleRows.map((row) => row.case_family));
  if (selectedCase !== "all") visibleCaseKeys.add(selectedCase);

  renderSummaryTable(
    "cases-body",
    settlement.totals.by_case.filter((item) => selectedCase === "all" || visibleCaseKeys.has(item.case_family)),
    [
      { render: (item) => `<td><span class="badge" title="${item.case_family}">${displayCase(item.case_family)}</span></td>` },
      { render: (item) => `<td>${item.rows}</td>` },
      { render: (item) => `<td>${item.address_count}</td>` },
      { render: (item) => `<td class="num">${item.planned_amount_gonka}</td>` },
      { render: (item) => `<td class="num">${item.p4_paid_overlap_gonka}</td>` },
      { render: (item) => `<td class="num">${item.overlap_adjustment_gonka}</td>` },
      { render: (item) => `<td class="num">${item.p4_overpaid_gonka}</td>` },
      { render: (item) => `<td class="num">${item.final_payout_gonka}</td>` },
    ],
  );

  renderSummaryTable(
    "addresses-body",
    settlement.totals.by_address.filter((item) => visibleAddressKeys.has(item.address)),
    [
      { render: (item) => `<td class="mono" title="${item.address}">${shortAddress(item.address)}</td>` },
      { render: (item) => `<td>${item.cases.map(displayCase).join(", ")}</td>` },
      { render: (item) => `<td>${item.epochs.join(", ")}</td>` },
      { render: (item) => `<td class="num">${item.planned_amount_gonka}</td>` },
      { render: (item) => `<td class="num">${item.p4_paid_overlap_gonka}</td>` },
      { render: (item) => `<td class="num">${item.overlap_adjustment_gonka}</td>` },
      { render: (item) => `<td class="num">${item.final_payout_gonka}</td>` },
    ],
  );

  renderSummaryTable(
    "epochs-body",
    settlement.totals.by_epoch.filter((item) => visibleEpochKeys.has(String(item.epoch))),
    [
      { render: (item) => `<td>${item.epoch}</td>` },
      { render: (item) => `<td>${item.rows}</td>` },
      { render: (item) => `<td>${item.address_count}</td>` },
      { render: (item) => `<td>${item.cases.map(displayCase).join(", ")}</td>` },
      { render: (item) => `<td class="num">${item.planned_amount_gonka}</td>` },
      { render: (item) => `<td class="num">${item.p4_paid_overlap_gonka}</td>` },
      { render: (item) => `<td class="num">${item.overlap_adjustment_gonka}</td>` },
      { render: (item) => `<td class="num">${item.final_payout_gonka}</td>` },
    ],
  );

  renderSummaryTable(
    "case-epochs-body",
    settlement.totals.by_case_epoch.filter((item) => visibleCaseEpochKeys.has(`${item.case_family}|${item.epoch}`)),
    [
      { render: (item) => `<td><span class="badge" title="${item.case_family}">${displayCase(item.case_family)}</span></td>` },
      { render: (item) => `<td>${item.epoch}</td>` },
      { render: (item) => `<td>${item.rows}</td>` },
      { render: (item) => `<td>${item.address_count}</td>` },
      { render: (item) => `<td class="num">${item.planned_amount_gonka}</td>` },
      { render: (item) => `<td class="num">${item.p4_paid_overlap_gonka}</td>` },
      { render: (item) => `<td class="num">${item.overlap_adjustment_gonka}</td>` },
      { render: (item) => `<td class="num">${item.final_payout_gonka}</td>` },
    ],
  );
}

function renderAll() {
  renderRows();
  renderAggregates();
  renderWarnings();
}

function rolePeople(caseItem) {
  return [
    ...(caseItem.investigators || []).map((person, index) => ["investigators", "investigator", person, index]),
    ...(caseItem.validators || []).map((person, index) => ["validators", "validator", person, index]),
    ["organizer", "organizer", caseItem.organizer || {}, 0],
  ];
}

function renderRoles() {
  renderRoleTotals();
  $("role-editor").innerHTML = roleConfig.cases
    .map((caseItem, caseIndex) => {
      const rows = rolePeople(caseItem)
        .map(([group, role, person, personIndex]) => {
          const path = `${caseIndex}:${group}:${personIndex}`;
          return `<div class="role-grid" data-role-path="${path}">
            <div><span class="badge">${role}</span></div>
            <label>Name<input value="${maskName(person.name)}" readonly></label>
            <label>Address<input data-field="address" value="${person.address || ""}" placeholder="gonka1..."></label>
            <label>Amount GONKA<input data-field="amount_gonka" value="${person.amount_gonka || "0.000000000"}"></label>
            <label>Comment<input data-field="comment" value="${person.comment || ""}"></label>
          </div>`;
        })
        .join("");
      return `<article class="case-role">
        <h2>${displayCase(caseItem.case_family)}: ${caseItem.title} ${caseItem.status ? `<span class="badge" title="${caseItem.case_family}">${caseItem.status}</span>` : ""}</h2>
        ${rows}
      </article>`;
    })
    .join("");

  document.querySelectorAll("[data-role-path] input").forEach((input) => {
    input.addEventListener("input", updateRoleField);
  });
}

function renderRoleTotals() {
  const byAddress = new Map();
  allRoleEntries().forEach((entry) => {
    const amount = BigInt(entry.amount_ngonka);
    if (amount <= 0n) return;
    const key = entry.address || "(missing address)";
    const item = byAddress.get(key) || {
      address: key,
      names: new Set(),
      roles: [],
      cases: new Set(),
      amount: 0n,
    };
    item.names.add(maskName(entry.name));
    item.roles.push(`${entry.role}: ${entry.amount_gonka}`);
    item.cases.add(entry.case_family);
    item.amount += amount;
    byAddress.set(key, item);
  });

  const rows = [...byAddress.values()].sort((a, b) => {
    if (a.address === "(missing address)") return -1;
    if (b.address === "(missing address)") return 1;
    return b.amount === a.amount ? a.address.localeCompare(b.address) : Number(b.amount - a.amount);
  });
  $("role-totals-body").innerHTML = rows.length
    ? rows.map((row) => `<tr>
        <td class="mono" title="${row.address}">${shortAddress(row.address)}</td>
        <td>${[...row.names].join(", ")}</td>
        <td>${row.roles.length}</td>
        <td>${[...row.cases].sort().map(displayCase).join(", ")}</td>
        <td class="num">${formatNgonka(row.amount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No non-zero role payouts.</td></tr>`;
}

function updateRoleField(event) {
  const wrapper = event.target.closest("[data-role-path]");
  const [caseIndexRaw, group, personIndexRaw] = wrapper.dataset.rolePath.split(":");
  const caseItem = roleConfig.cases[Number(caseIndexRaw)];
  const person = group === "organizer" ? caseItem.organizer : caseItem[group][Number(personIndexRaw)];
  person[event.target.dataset.field] = event.target.value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roleConfig));
  renderRoleTotals();
  renderWarnings();
}

function allRoleEntries() {
  const entries = [];
  roleConfig.cases.forEach((caseItem) => {
    rolePeople(caseItem).forEach(([, role, person]) => {
      const amount = caseItem.status === "rejected_by_coordinator" ? 0n : amountToBigInt(person.amount_gonka || "0");
      entries.push({
        case_family: caseItem.case_family,
        role,
        name: person.name || "",
        address: person.address || "",
        amount_ngonka: amount.toString(),
        amount_gonka: formatNgonka(amount),
        comment: person.comment || "",
      });
    });
  });

  return entries;
}

function validationErrors() {
  const errors = [];
  allRoleEntries().forEach((entry) => {
    if (BigInt(entry.amount_ngonka) > 0n && !gonkaAddressOk(entry.address)) {
      errors.push(`${entry.case_family} ${entry.role} ${maskName(entry.name)}: non-zero ${entry.amount_gonka} GONKA needs a valid address`);
    }
  });
  return errors;
}

function renderWarnings() {
  const errors = validationErrors();
  const box = $("warnings");
  box.hidden = errors.length === 0;
  box.innerHTML = errors.length ? `<strong>Proposal export blocked</strong><ul>${errors.map((error) => `<li>${error}</li>`).join("")}</ul>` : "";
}

function buildVictimOutputs() {
  const byAddress = new Map();
  const breakdown = [];
  settlement.rows.forEach((row) => {
    const amount = BigInt(row.final_payout_ngonka);
    if (amount <= 0n) return;
    byAddress.set(row.address, (byAddress.get(row.address) || 0n) + amount);
    breakdown.push({
      category: "victim",
      case_family: row.case_family,
      epoch: row.epoch,
      address: row.address,
      amount_ngonka: amount.toString(),
      amount_gonka: formatNgonka(amount),
      source_row: row,
    });
  });
  const outputs = [...byAddress.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([address, amount]) => ({
    recipient: address,
    amount: [{ denom: "ngonka", amount: amount.toString() }],
  }));
  return { outputs, breakdown };
}

function buildProposalArtifacts() {
  const errors = validationErrors();
  if (errors.length) {
    renderWarnings();
    throw new Error(errors.join("\n"));
  }

  const settings = roleConfig.settings;
  const { outputs, breakdown: victimBreakdown } = buildVictimOutputs();
  const roleBreakdown = allRoleEntries()
    .filter((entry) => BigInt(entry.amount_ngonka) > 0n)
    .map((entry) => ({ category: "role", ...entry }));
  const roleTotalsByAddress = new Map();
  roleBreakdown.forEach((entry) => {
    roleTotalsByAddress.set(entry.address, (roleTotalsByAddress.get(entry.address) || 0n) + BigInt(entry.amount_ngonka));
  });
  const roleMessages = [...roleTotalsByAddress.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([address, amount]) => ({
    "@type": "/cosmos.distribution.v1beta1.MsgCommunityPoolSpend",
    authority: settings.authority,
    recipient: address,
    amount: [{ denom: "ngonka", amount: amount.toString() }],
  }));
  const proposal = {
    messages: [
      {
        "@type": "/inference.streamvesting.MsgBatchTransferWithVesting",
        sender: settings.authority,
        outputs,
        vesting_epochs: String(settings.vesting_epochs || "150"),
      },
      ...roleMessages,
    ],
    metadata: settings.metadata,
    deposit: settings.deposit,
    title: settings.title,
    summary: settings.summary,
  };

  const victimTotal = victimBreakdown.reduce((sum, entry) => sum + BigInt(entry.amount_ngonka), 0n);
  const roleTotal = roleBreakdown.reduce((sum, entry) => sum + BigInt(entry.amount_ngonka), 0n);
  const breakdown = {
    totals: {
      victim_payout_ngonka: victimTotal.toString(),
      victim_payout_gonka: formatNgonka(victimTotal),
      role_payout_ngonka: roleTotal.toString(),
      role_payout_gonka: formatNgonka(roleTotal),
      proposal_total_ngonka: (victimTotal + roleTotal).toString(),
      proposal_total_gonka: formatNgonka(victimTotal + roleTotal),
      victim_recipient_count: outputs.length,
      role_entry_count: roleBreakdown.length,
      role_message_count: roleMessages.length,
    },
    entries: [...victimBreakdown, ...roleBreakdown],
  };
  return { proposal, breakdown };
}

function wireEvents() {
  ["case-filter", "epoch-filter", "overlap-filter", "address-filter"].forEach((id) => {
    $(id).addEventListener("input", renderAll);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.add("hidden"));
      tab.classList.add("active");
      document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.remove("hidden");
    });
  });
  $("export-roles").addEventListener("click", () => downloadJson("role_config.json", roleConfig));
  $("export-proposal").addEventListener("click", () => downloadJson("proposal.json", buildProposalArtifacts().proposal));
  $("export-breakdown").addEventListener("click", () => downloadJson("payout_breakdown.json", buildProposalArtifacts().breakdown));
  $("role-import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    roleConfig = JSON.parse(await file.text());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roleConfig));
    renderRoles();
    renderWarnings();
  });
}

async function init() {
  const [settlementResponse, roleResponse] = await Promise.all([
    fetch("data/settlement.json"),
    fetch("data/role_config.json"),
  ]);
  settlement = await settlementResponse.json();
  const defaultRoles = await roleResponse.json();
  roleConfig = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || defaultRoles;
  renderSummary();
  fillFilters();
  renderRoles();
  wireEvents();
  renderAll();
}

init().catch((error) => {
  $("warnings").hidden = false;
  $("warnings").textContent = `Failed to load dashboard data: ${error.message}`;
});
