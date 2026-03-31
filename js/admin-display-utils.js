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
