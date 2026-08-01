CREATE TABLE IF NOT EXISTS jira_kpi_reports (
  id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL DEFAULT '',
  sprint_name TEXT NOT NULL DEFAULT '',
  date_from TEXT NOT NULL DEFAULT '',
  date_to TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT '',
  report JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE jira_kpi_reports
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS jira_kpi_reports_created_at_idx
  ON jira_kpi_reports (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS jira_kpi_reports_team_sprint_idx
  ON jira_kpi_reports (team_name, sprint_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS jira_kpi_reports_deleted_at_idx
  ON jira_kpi_reports (deleted_at)
  WHERE deleted_at IS NOT NULL;
