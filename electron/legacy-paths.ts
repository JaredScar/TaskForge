/**
 * Historical on-disk locations only — must match what older Windows installs actually wrote
 * under `%APPDATA%` before the TaskForge rename, or migration will not find existing databases.
 */
export const LEGACY_ROAMING_USERDATA_DIR_NAMES = ['AutoDesk', 'autodesk'] as const;

export const LEGACY_ROAMING_SQLITE_BASENAME = 'autodesk.db';

/** Self row email seeded under the previous product id — normalize for current UI. */
export const LEGACY_SELF_TEAM_EMAIL = 'local@autodesk.app';

/**
 * HMAC secret shipped with pre-TaskForge dev builds. Used only when verifying signed keys if
 * `TASKFORGE_ENTITLEMENT_SECRET` is unset, so older locally generated keys still validate.
 */
export const LEGACY_DEV_ENTITLEMENT_SECRET = 'autodesk-desktop-dev-entitlement-v1';
