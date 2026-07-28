export const STATUS_MAP = {
  ready: "ready",
  draft: "draft",
  "in progress": "in_progress",
  "code review": "code_review",
  "automation test": "automation_test",
  "automatic test": "automation_test",
  "manual test": "manual_test",
  qa: "qa",
  done: "done",
  closed: "done",
  resolved: "done",
  suspended: "suspended"
};

export const DEVELOPMENT_COMPLETED = new Set(["code_review", "automation_test", "manual_test", "done"]);
