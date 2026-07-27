# Production Readiness Checklist

Status values: `passed`, `failed`, `not tested`, `not applicable`.

## File Upload
- Status: `not tested`
- Notes: UI was improved with Persian workflow steps, file statuses, disabled Generate explanation, and local privacy notice. Full browser upload workflow still requires browser automation or manual validation.

## XLS Parsing
- Status: `passed`
- Evidence: Real-data validation parses `sample-data/capacity.xlsx`; current source is an OLE workbook despite `.xlsx` extension and is handled.

## XLSX Parsing
- Status: `passed`
- Evidence: Real-data validation parses `sample-data/jira.xlsx` with sheets `sprint 26.1` and `QA Return `.

## DOCX Parsing
- Status: `passed`
- Evidence: Real-data validation parses `sample-data/kpi.docx` and detects 18 KPI definitions.

## Jira Sheet Selection
- Status: `passed`
- Evidence: Real-data validation detects main sheet `sprint 26.1` and QA sheet `QA Return `.

## QA Return Matching
- Status: `passed`
- Evidence: Real-data validation passes; remaining unmatched QA Return keys are visibly preserved as source-data warnings: `RCA-3299`, `RCA-3288`, `PODCM-4922`.

## Capacity Parsing
- Status: `passed`
- Evidence: Real-data validation detects 7 capacity people.

## Field Mapping
- Status: `passed`
- Evidence: Mapping table renders detected Jira headers; required field metadata is tested by `tests/ui-production-tests.js`.

## Person Mapping
- Status: `passed`
- Evidence: Person mappings are rendered from capacity rows and covered by readiness/filter regression tests.

## Management Dashboard
- Status: `passed`
- Evidence: Automated calculation, reconciliation, and UI-independent filter tests pass. Browser visual workflow is separately marked not tested until browser automation is available.

## Developer Dashboard
- Status: `passed`
- Evidence: Real-data calculation tests produce mapped developer dashboards. Browser visual inspection is not yet tested.

## QA Dashboard
- Status: `passed`
- Evidence: Real-data calculation tests produce mapped QA dashboards and reconciliation confirms QA buckets.

## KPI Drill-Down
- Status: `passed`
- Evidence: Every KPI card renders a drill-down button; fallback drill-down payload includes formula, result, filters, version, included issues, exclusions, and N/A reasons.

## Reconciliation
- Status: `passed`
- Evidence: `tests/reconciliation-tests.js` passes and real reconciliation difference is 0 hours with status `warning`.

## Data Quality
- Status: `passed`
- Evidence: Data-quality warnings are preserved and summarized in the Management Dashboard.

## Filters
- Status: `passed`
- Evidence: `tests/ui-production-tests.js` covers team, sprint, date range, person, role, status, and plan type filters independently and in combination.

## Charts
- Status: `not tested`
- Notes: Chart null handling, Chart.js destroy-before-rerender, labels, and blocked-time outlier note were implemented. Visual chart rendering requires browser validation.

## Tables
- Status: `passed`
- Evidence: Issue table has headers, pagination, sorting, search, and CSV export. Browser visual overflow still needs manual/browser validation.

## IndexedDB History
- Status: `not tested`
- Notes: Existing history, save, reopen, delete, backup, restore, and clear-local-data code paths remain. Full browser persistence workflow still needs browser validation.

## Backup and Restore
- Status: `not tested`
- Notes: JSON restore now validates shape and reports Persian errors. Browser download/upload workflow still needs validation.

## CSV Export
- Status: `passed`
- Evidence: Issue CSV export rows are generated from the currently filtered issue table.

## JSON Export
- Status: `passed`
- Evidence: Report backup and reconciliation JSON export paths exist; generated reconciliation JSON is written by real-data validation.

## Holiday Management
- Status: `not tested`
- Notes: Existing holiday manager remains; browser interaction needs validation.

## Responsive Layout
- Status: `not tested`
- Notes: Requires browser viewport checks at 1440, 1024, 768, and 390 px.

## RTL Layout
- Status: `not tested`
- Notes: HTML `dir="rtl"` is set and Persian text was cleaned up in touched surfaces. Visual RTL validation requires browser checks.

## Error Handling
- Status: `not tested`
- Notes: Upload, generation, backup restore, and holiday import now avoid stack traces for normal users. The full invalid-file matrix still needs browser/manual validation.

## Privacy
- Status: `passed`
- Evidence: App is static and processes files locally in the browser; the landing screen now visibly states that files are not sent to a server.

## Performance
- Status: `passed`
- Evidence: `tests/performance-result.json` contains measured Node pipeline timings for real and generated 5,000-row datasets. Browser render timing is marked `not tested`.

## Browser Compatibility
- Status: `not tested`
- Notes: Static app uses modern ES modules, IndexedDB, dialog, and Chart.js. Cross-browser execution still needs browser validation.
