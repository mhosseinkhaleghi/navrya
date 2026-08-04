// Merges the hardcoded XP-engine defaults (xp-rules.mjs, mastery-rules.mjs, achievement-rules.mjs)
// with admin-set overrides from Postgres (xp_config_overrides, Section 11's "Admin XP &
// Segmentation" tab), so an admin edit actually changes real XP-awarding behavior, not just a
// reporting dashboard. TTL-cached in-process (this runs in the same process/pool as the admin
// routes that write these overrides - no cross-process cache needed, unlike admin_ai_keys'
// internal-HTTP bridge to the separate AI gateway process) since POST /me/xp-events is a real
// hot path that previously read these values as free in-memory constants; a DB round trip on
// every single XP award would be a real regression.
import {
  POINTS_BY_TYPE, DOMAIN_DAILY_CAP, PER_SOURCE_MAX, PER_TYPE_PERIOD_CAP, RECURRING_DAILY_CAP_TOTAL, SOURCE_TOTAL_CAP
} from './xp-rules.mjs';
import { LEVEL_REQUIREMENTS as DEFAULT_LEVEL_REQUIREMENTS } from './mastery-rules.mjs';
import { ACHIEVEMENTS } from './achievement-rules.mjs';

// level_5_reached/five_day_login_streak are granted outside the normal achievement-unlock route
// (see routes.profile.mjs's GET /me/achievements) and were previously hardcoded inline there -
// pulled out here so their points are admin-editable too, same as every other achievement.
export const SERVER_ONLY_ACHIEVEMENT_POINTS = { level_5_reached: 0, five_day_login_streak: 40 };

const CACHE_TTL_MS = 30000;
let cache = { data: null, fetchedAt: 0 };

// Called by every admin write route so the very next request sees the change immediately,
// rather than waiting out the full TTL - the TTL alone only protects against a hot loop of reads.
export function invalidateXpConfigCache() { cache = { data: null, fetchedAt: 0 }; }

function cloneDeep(value) { return JSON.parse(JSON.stringify(value)); }

function setNestedRequirement(req, requirementKey, value) {
  if (requirementKey.indexOf(':') === -1) { req[requirementKey] = value; return; }
  const [outer, inner] = requirementKey.split(':');
  if (!req[outer] || typeof req[outer] !== 'object') req[outer] = {};
  req[outer][inner] = value;
}

function buildEffective(overrideRows) {
  const points = cloneDeep(POINTS_BY_TYPE);
  const domainCaps = cloneDeep(DOMAIN_DAILY_CAP);
  const sourceCaps = cloneDeep(PER_SOURCE_MAX);
  const periodCaps = cloneDeep(PER_TYPE_PERIOD_CAP);
  const sourceTotalCaps = cloneDeep(SOURCE_TOTAL_CAP);
  let recurringCap = RECURRING_DAILY_CAP_TOTAL;
  const achievementPoints = {};
  Object.keys(ACHIEVEMENTS).forEach((key) => { achievementPoints[key] = ACHIEVEMENTS[key].points; });
  Object.keys(SERVER_ONLY_ACHIEVEMENT_POINTS).forEach((key) => { achievementPoints[key] = SERVER_ONLY_ACHIEVEMENT_POINTS[key]; });
  const masteryRequirements = cloneDeep(DEFAULT_LEVEL_REQUIREMENTS);
  const overridesByKey = {};

  overrideRows.forEach((row) => {
    overridesByKey[row.key] = row;
    const value = row.value || {};
    if (row.key.indexOf('points:') === 0) {
      const type = row.key.slice('points:'.length);
      if (type in points && Number.isFinite(value.points)) points[type] = value.points;
    } else if (row.key.indexOf('domainCap:') === 0) {
      const domain = row.key.slice('domainCap:'.length);
      if (domain in domainCaps && Number.isFinite(value.dailyCap)) domainCaps[domain] = value.dailyCap;
    } else if (row.key === 'recurringCap') {
      if (Number.isFinite(value.dailyCap)) recurringCap = value.dailyCap;
    } else if (row.key.indexOf('sourceCap:') === 0) {
      const type = row.key.slice('sourceCap:'.length);
      if (type in sourceCaps && Number.isFinite(value.maxCount)) sourceCaps[type] = value.maxCount;
    } else if (row.key.indexOf('periodCap:') === 0) {
      const type = row.key.slice('periodCap:'.length);
      if (type in periodCaps && Number.isFinite(value.maxCount)) periodCaps[type] = { max: value.maxCount, period: value.period === 'week' ? 'week' : 'day' };
    } else if (row.key.indexOf('sourceTotalCap:') === 0) {
      const sourceType = row.key.slice('sourceTotalCap:'.length);
      if (sourceType in sourceTotalCaps && Number.isFinite(value.cap)) sourceTotalCaps[sourceType] = value.cap;
    } else if (row.key.indexOf('achievementPoints:') === 0) {
      const achKey = row.key.slice('achievementPoints:'.length);
      if (achKey in achievementPoints && Number.isFinite(value.points)) achievementPoints[achKey] = value.points;
    } else if (row.key.indexOf('mastery:') === 0) {
      const rest = row.key.slice('mastery:'.length);
      const sep = rest.indexOf(':');
      const level = Number(rest.slice(0, sep));
      const requirementKey = rest.slice(sep + 1);
      if (masteryRequirements[level] && requirementKey && Number.isFinite(value.value)) {
        setNestedRequirement(masteryRequirements[level], requirementKey, value.value);
      }
    }
  });

  return { points, domainCaps, recurringCap, sourceCaps, periodCaps, sourceTotalCaps, achievementPoints, masteryRequirements, overridesByKey };
}

export async function getEffectiveXpConfig(repo) {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const rows = await repo.xpConfig.list();
  cache = { data: buildEffective(rows), fetchedAt: Date.now() };
  return cache.data;
}
