export function serializeFieldMappings(form) {
  return [...form.querySelectorAll("[data-field-key]")].reduce((acc, input) => {
    acc[input.dataset.fieldKey] = input.value;
    return acc;
  }, {});
}

export function serializePersonMappings(table) {
  return [...table.querySelectorAll("tbody tr")].map((row) => ({
    capacityId: row.dataset.capacityId || "",
    capacityName: row.querySelector("[data-person-field='capacityName']").value,
    jiraName: row.querySelector("[data-person-field='jiraName']").value,
    role: row.querySelector("[data-person-field='role']").value,
    workLogColumn: row.querySelector("[data-person-field='workLogColumn']").value,
    enabled: row.querySelector("[data-person-field='enabled']").checked
  }));
}

