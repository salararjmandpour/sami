export const CALCULATION_VERSION = "1.1.0";
export const REQUIRED_FIELDS = ["issueKey", "status"];
export const KPI_CARD_ORDER = [
  "capacityUtilization", "plannedWork", "unplannedWork", "carryOver", "deliveryRateDevelop",
  "deliveryRate", "submittedToQa", "qaReturnRate", "firstPassRate", "hotfixCount",
  "bugfixCount", "rawWorkLogged", "productiveWorkLogged", "blockWorkLogged", "meetingWorkLogged",
  "technicalVersionWorkLogged", "nonProductiveWorkLogged", "leadTime", "cycleTime", "blockedTime", "estimationAccuracy",
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
  rawWorkLogged: "زمان ثبت‌شده کل",
  productiveWorkLogged: "زمان انجام کار اصلی",
  blockWorkLogged: "زمان ثبت‌شده بلاک",
  meetingWorkLogged: "زمان ثبت‌شده جلسات",
  technicalWorkLogged: "زمان ثبت‌شده Technical",
  versionWorkLogged: "زمان ثبت‌شده Version",
  technicalVersionWorkLogged: "زمان ثبت‌شده Technical + Version",
  nonProductiveWorkLogged: "مجموع زمان‌های غیرعملیاتی",
  leadTime: "Lead Time",
  cycleTime: "Cycle Time",
  blockedTime: "زمان بلاک",
  estimationAccuracy: "دقت تخمین",
  averageStorySize: "Average Story Size",
  reworkRate: "Rework Rate",
  wip: "Average WIP"
};
