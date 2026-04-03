import { normalizeUserRole } from './auth.js';

const ROLE_TEACHER = 'teacher';
const ROLE_ADMIN = 'admin';
const ROLE_DEVELOPER = 'developer';
const ROLE_STUDENT = 'student';

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const normalizeText = (value) => String(value || '').trim();

export const normalizeDisplayText = (value, fallback = '') => {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'nan' || lower === 'infinity' || normalized === '[object Object]') {
    return fallback;
  }

  return normalized;
};

export const normalizeCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
};

export const formatLastUpdatedLabel = (lastUpdatedAt = null, {
  now = Date.now()
} = {}) => {
  const normalizedLastUpdatedAt = Number(lastUpdatedAt);
  const normalizedNow = Number(now);
  if (!Number.isFinite(normalizedLastUpdatedAt) || !Number.isFinite(normalizedNow)) {
    return 'Last updated: just now';
  }

  const diffMinutes = Math.floor((normalizedNow - normalizedLastUpdatedAt) / 60000);
  if (diffMinutes <= 0) {
    return 'Last updated: just now';
  }
  if (diffMinutes === 1) {
    return 'Last updated: 1 minute ago';
  }
  return `Last updated: ${diffMinutes} minutes ago`;
};

export const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

const getInitials = (value = '', fallback = 'NA') => {
  const normalized = normalizeDisplayText(value, '');
  if (!normalized) return fallback;

  const parts = normalized
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return normalized.slice(0, 2).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const getAvatarToneClass = (role = '') => {
  const normalized = normalizeText(role).toLowerCase();
  if (normalized === ROLE_DEVELOPER) return 'role-developer';
  if (normalized === ROLE_ADMIN) return 'role-admin';
  if (normalized === ROLE_TEACHER) return 'role-teacher';
  if (normalized === ROLE_STUDENT) return 'role-student';
  return 'role-default';
};

const buildAvatarMarkup = (label = '', role = '') => {
  const initials = getInitials(label, 'NA');
  return `<span class="avatar ${getAvatarToneClass(role)}" aria-hidden="true">${escapeHtml(initials)}</span>`;
};

export const buildIdentityMarkup = ({
  label = 'Unknown',
  secondary = '',
  role = '',
  avatarLabel = '',
  containerClass = 'identity-cell',
  copyClass = 'identity-copy'
} = {}) => {
  const safeLabel = normalizeDisplayText(label, 'Unknown');
  const safeSecondary = normalizeDisplayText(secondary, '');
  const safeAvatarLabel = normalizeDisplayText(avatarLabel, '');
  return `
    <div class="${containerClass}">
      ${buildAvatarMarkup(safeAvatarLabel || safeLabel, role)}
      <div class="${copyClass}">
        <strong>${escapeHtml(safeLabel)}</strong>
        ${safeSecondary ? `<span>${escapeHtml(safeSecondary)}</span>` : ''}
      </div>
    </div>
  `;
};

export const buildStackedTextMarkup = ({
  containerClass = 'table-meta-stack',
  primary = '',
  secondary = ''
} = {}) => {
  const safeContainerClass = normalizeText(containerClass) || 'table-meta-stack';
  const safePrimary = normalizeDisplayText(primary, '');
  const safeSecondary = normalizeDisplayText(secondary, '');
  return `
    <div class="${escapeHtml(safeContainerClass)}">
      ${safePrimary ? `<strong>${escapeHtml(safePrimary)}</strong>` : ''}
      ${safeSecondary ? `<span>${escapeHtml(safeSecondary)}</span>` : ''}
    </div>
  `;
};

export const buildEmptyTableRowMarkup = ({
  columnCount = 1,
  icon = 'ℹ️',
  message = 'No items found.'
} = {}) => {
  const normalizedColumnCount = Math.max(1, Number.parseInt(columnCount, 10) || 1);
  const normalizedIcon = normalizeDisplayText(icon, 'ℹ️');
  const normalizedMessage = normalizeDisplayText(message, 'No items found.');
  return `<tr><td colspan="${normalizedColumnCount}" class="empty-row"><div class="smart-empty"><span>${escapeHtml(normalizedIcon)}</span><p>${escapeHtml(normalizedMessage)}</p></div></td></tr>`;
};

 export const formatRoleLabel = (role) => {
   const rawRole = normalizeText(role).toLowerCase();
   if (rawRole === ROLE_STUDENT) return 'Student';
   const normalized = normalizeUserRole(role);
   if (normalized === ROLE_DEVELOPER) return 'Developer';
   if (normalized === ROLE_ADMIN) return 'Admin';
   return 'Teacher';
 };

 export const getRoleBadgeClass = (role) => {
   const rawRole = normalizeText(role).toLowerCase();
   if (rawRole === ROLE_STUDENT) return 'role-student';
   const normalized = normalizeUserRole(role);
   if (normalized === ROLE_DEVELOPER) return 'role-developer';
   if (normalized === ROLE_ADMIN) return 'role-admin';
   return 'role-teacher';
 };

 export const buildRoleBadgeMarkup = (role) => {
   const safeRole = normalizeText(role);
   return `<span class="inline-role-badge ${getRoleBadgeClass(safeRole)}">${escapeHtml(formatRoleLabel(safeRole))}</span>`;
 };

 export const buildClassTokenMarkup = ({
   label = '—',
   title = ''
 } = {}) => {
   const safeLabel = normalizeDisplayText(label, '—');
   const safeTitle = normalizeDisplayText(title, '');
   return `<span class="class-token"${safeTitle ? ` title="${escapeHtml(safeTitle)}"` : ''}>${escapeHtml(safeLabel)}</span>`;
 };

 export const formatCreatedAt = (value) => {
   if (!value) return '—';
   if (typeof value?.toDate === 'function') {
     return value.toDate().toLocaleString();
   }
   const parsed = new Date(value);
   if (Number.isNaN(parsed.getTime())) return '—';
   return parsed.toLocaleString();
 };

 export const formatTimeOfDay = (value) => {
   if (!value) return '—';
   const parsed = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
   if (Number.isNaN(parsed.getTime())) return '—';
   return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 };

 export const formatTargetIdentifier = (value = '') => {
   const target = normalizeDisplayText(value, '');
   if (!target) return '';

   if (/^\d{12,}$/.test(target)) {
     const asNumber = Number(target);
     if (Number.isFinite(asNumber) && asNumber > 946684800000) {
       const asDate = new Date(asNumber);
       if (!Number.isNaN(asDate.getTime())) {
         return asDate.toLocaleString();
       }
     }
   }

   if (target.length > 28) {
     return `${target.slice(0, 10)}…${target.slice(-6)}`;
   }

   return target;
 };

 export const formatActionLabel = (action = '') => {
   const normalized = normalizeDisplayText(action, '').toLowerCase();
   if (!normalized) return 'updated';
   return normalized
     .replace(/[_-]+/g, ' ')
     .replace(/\s+/g, ' ')
     .trim();
 };
