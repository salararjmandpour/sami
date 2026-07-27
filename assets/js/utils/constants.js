export const CALCULATION_VERSION = "1.0.0";
export const REQUIRED_FIELDS = ["issueKey", "status"];
export const KPI_CARD_ORDER = [
  "capacityUtilization", "plannedWork", "unplannedWork", "carryOver", "deliveryRateDevelop",
  "deliveryRate", "submittedToQa", "qaReturnRate", "firstPassRate", "hotfixCount",
  "bugfixCount", "leadTime", "cycleTime", "blockedTime", "estimationAccuracy",
  "averageStorySize", "reworkRate", "wip"
];

export const KPI_LABELS = {
  capacityUtilization: "بهره‌برداری ظرفیت",
  plannedWork: "کار برنامه‌ریزی‌شده",
  unplannedWork: "کار خارج از برنامه",
  carryOver: "Carry Over",
  deliveryRateDevelop: "نرخ تحویل توسعه",
  deliveryRate: "نرخ تحویل",
  submittedToQa: "ارسال‌شده به QA",
  qaReturnRate: "نرخ بازگشت از QA",
  firstPassRate: "نرخ عبور اول",
  hotfixCount: "Hotfix",
  bugfixCount: "Bug Fix",
  leadTime: "Lead Time",
  cycleTime: "Cycle Time",
  blockedTime: "زمان بلاک",
  estimationAccuracy: "دقت تخمین",
  averageStorySize: "Average Story Size",
  reworkRate: "Rework Rate",
  wip: "Average WIP"
};
