export const ALLOWED_RANKS = [
  "Junior Moderator",
  "Moderator",
  "Junior Administrator",
  "Administrator",
  "Staff Supervisor",
  "Internal Affairs",
  "Management",
  "Director",
  "Co Owner",
  "Owner"
];

const RANK_LEVELS = {
  "Junior Moderator": 1,
  "Moderator": 2,
  "Junior Administrator": 3,
  "Administrator": 4,
  "Staff Supervisor": 5,
  "Internal Affairs": 6,
  "Management": 7,
  "Director": 8,
  "Co Owner": 9,
  "Owner": 10
};

const LEGACY_RANK_MAP = {
  staff: "Junior Moderator",
  mod: "Moderator",
  moderator: "Moderator",
  "junior moderator": "Junior Moderator",
  junior_moderator: "Junior Moderator",
  admin: "Administrator",
  administrator: "Administrator",
  "junior administrator": "Junior Administrator",
  junior_administrator: "Junior Administrator",
  "head admin": "Administrator",
  "headadmin": "Administrator",
  head_admin: "Administrator",
  "co owner": "Co Owner",
  "co-owner": "Co Owner",
  co_owner: "Co Owner",
  owner: "Owner",
  "staff supervisor": "Staff Supervisor",
  staff_supervisor: "Staff Supervisor",
  "internal affairs": "Internal Affairs",
  internal_affairs: "Internal Affairs",
  management: "Management",
  director: "Director"
};

export function normalizeRank(rank) {
  if (!rank) return "Junior Moderator";

  const raw = String(rank).trim();
  if (ALLOWED_RANKS.includes(raw)) return raw;

  return LEGACY_RANK_MAP[raw.toLowerCase()] || "Junior Moderator";
}

export function formatRankLabel(rank) {
  return normalizeRank(rank);
}

export function getRankLevel(rank) {
  const normalized = normalizeRank(rank);
  return RANK_LEVELS[normalized] || 0;
}

export function canAccessStaffTools(rank) {
  return getRankLevel(rank) >= getRankLevel("Administrator");
}

export function canManageRankChanges(actingRank, targetRank) {
  const acting = normalizeRank(actingRank);
  const target = normalizeRank(targetRank);

  if (acting === "Owner" || acting === "Co Owner") return true;
  if (getRankLevel(acting) >= getRankLevel("Management")) {
    return ["Junior Moderator", "Moderator", "Junior Administrator", "Administrator", "Staff Supervisor"].includes(target);
  }
  return false;
}

export function canHandleBolo(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner", "Director", "Management"].includes(normalized);
}

export function canManagePresets(rank) {
  return getRankLevel(rank) >= getRankLevel("Management");
}

export function canManageLoa(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner", "Director", "Management", "Internal Affairs"].includes(normalized);
}

export function canManageStaff(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner"].includes(normalized);
}

export function canManageReasons(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner"].includes(normalized);
}

export function canViewAllShifts(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner", "Director", "Management", "Internal Affairs", "Staff Supervisor"].includes(normalized);
}

export function canManageShifts(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner", "Director", "Management"].includes(normalized);
}

export function canAccessRemoteControl(rank) {
  const normalized = normalizeRank(rank);
  return ["Owner", "Co Owner", "Director", "Management"].includes(normalized);
}

export function canViewErlcData(rank) {
  const normalized = normalizeRank(rank);
  return ALLOWED_RANKS.includes(normalized);
}

export function isHigherOrEqual(rank, threshold) {
  return getRankLevel(rank) >= getRankLevel(threshold);
}
