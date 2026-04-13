/**
 * Tooltip System — lightweight, attribute-based
 * Usage: <button data-tooltip="Helpful text">
 * Supports: hover (desktop), long-press (mobile), keyboard focus
 */
(function () {
  'use strict';

  const DELAY_SHOW = 200;
  const DELAY_HIDE = 80;
  const LONG_PRESS_MS = 500;
  const OFFSET = 8;

  let bubble = null;
  let showTimer = null;
  let hideTimer = null;
  let pressTimer = null;
  let currentTarget = null;

  function createBubble() {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.className = 'app-tooltip';
    bubble.setAttribute('role', 'tooltip');
    bubble.id = 'app-tooltip-' + Date.now();
    document.body.appendChild(bubble);
    return bubble;
  }

  function positionBubble(target) {
    const b = createBubble();
    const rect = target.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;
    let placement = 'top';

    // Prefer above, fallback to below
    if (rect.top - bRect.height - OFFSET > 8) {
      top = rect.top - bRect.height - OFFSET;
      placement = 'top';
    } else {
      top = rect.bottom + OFFSET;
      placement = 'bottom';
    }

    // Center horizontally, clamp to viewport
    left = rect.left + rect.width / 2 - bRect.width / 2;
    left = Math.max(8, Math.min(left, vw - bRect.width - 8));
    top = Math.max(8, Math.min(top, vh - bRect.height - 8));

    b.style.top = top + 'px';
    b.style.left = left + 'px';
    b.setAttribute('data-placement', placement);
  }

  function show(target) {
    const text = (target.getAttribute('data-tooltip') || '').trim();
    if (!text) return;

    clearTimeout(hideTimer);
    const b = createBubble();
    b.textContent = text;
    currentTarget = target;

    // Link for accessibility
    target.setAttribute('aria-describedby', b.id);

    // Position (needs to be visible for measurement)
    b.style.opacity = '0';
    b.style.display = 'block';

    requestAnimationFrame(function () {
      positionBubble(target);
      b.classList.add('is-visible');
    });
  }

  function hide() {
    clearTimeout(showTimer);
    if (bubble) {
      bubble.classList.remove('is-visible');
    }
    if (currentTarget) {
      currentTarget.removeAttribute('aria-describedby');
      currentTarget = null;
    }
  }

  function scheduleShow(target) {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    if (currentTarget === target) return;
    showTimer = setTimeout(function () { show(target); }, DELAY_SHOW);
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, DELAY_HIDE);
  }

  // ── DESKTOP: hover ─────────────────────────────────────────
  document.addEventListener('mouseover', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) scheduleShow(target);
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) scheduleHide();
  }, { passive: true });

  // ── KEYBOARD: focus ────────────────────────────────────────
  document.addEventListener('focusin', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) scheduleShow(target);
  }, { passive: true });

  document.addEventListener('focusout', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) scheduleHide();
  }, { passive: true });

  // ── MOBILE: long-press ─────────────────────────────────────
  document.addEventListener('touchstart', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(function () {
      show(target);
      // Auto-hide after 2.5s on mobile
      setTimeout(hide, 2500);
    }, LONG_PRESS_MS);
  }, { passive: true });

  document.addEventListener('touchend', function () {
    clearTimeout(pressTimer);
  }, { passive: true });

  document.addEventListener('touchmove', function () {
    clearTimeout(pressTimer);
    hide();
  }, { passive: true });

  // ── ESCAPE key hides tooltip ───────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });

  // ── SCROLL / RESIZE: reposition or hide ────────────────────
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('resize', hide, { passive: true });

})();
