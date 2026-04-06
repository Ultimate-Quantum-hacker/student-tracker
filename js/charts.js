/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — charts.js
   Chart rendering and visualization.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const CLASS_CHART_DIMENSIONS = {
  width: 640,
  height: 320,
  padding: {
    top: 24,
    right: 24,
    bottom: 52,
    left: 48
  }
};

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeClassChartDatum = (entry = {}, index = 0) => {
  var score = Number(entry.overall || 0);
  var fullName = entry.name || ('Exam ' + (index + 1));
  var shortName = (fullName && fullName.toLowerCase().startsWith('mock '))
    ? 'M' + (index + 1)
    : fullName;

  return {
    name: shortName,
    fullName: fullName,
    score: Number.isFinite(score) ? score : 0
  };
};

const getClassChartPalette = () => {
  var darkMode = document.body.classList.contains('dark-mode');

  return darkMode
    ? {
        cardFrom: '#0f172a',
        cardTo: '#1e293b',
        border: '#334155',
        title: '#f8fafc',
        tick: '#94a3b8',
        grid: '#334155',
        axis: '#475569',
        lineStart: '#93c5fd',
        lineEnd: '#2563eb',
        pointFill: '#020617',
        pointStroke: '#60a5fa',
        pointLabel: '#e2e8f0',
        trendUp: '#4ade80',
        trendDown: '#f87171',
        trendFlat: '#64748b',
        areaStart: 'rgba(59, 130, 246, 0.26)',
        areaEnd: 'rgba(59, 130, 246, 0.04)',
        shadow: '0 20px 48px rgba(0, 0, 0, 0.4)'
      }
    : {
        cardFrom: '#f8fafc',
        cardTo: '#e2e8f0',
        border: '#cbd5e1',
        title: '#0f172a',
        tick: '#475569',
        grid: '#cbd5e1',
        axis: '#94a3b8',
        lineStart: '#60a5fa',
        lineEnd: '#2563eb',
        pointFill: '#ffffff',
        pointStroke: '#3b82f6',
        pointLabel: '#0f172a',
        trendUp: '#16a34a',
        trendDown: '#dc2626',
        trendFlat: '#64748b',
        areaStart: 'rgba(59, 130, 246, 0.18)',
        areaEnd: 'rgba(59, 130, 246, 0.02)',
        shadow: '0 15px 35px rgba(15, 23, 42, 0.12)'
      };
};

const buildClassChartTicks = (domainMin = 0, domainMax = 100) => {
  var range = Math.max(domainMax - domainMin, 1);
  return Array.from({ length: 5 }, function (_, index) {
    var ratio = index / 4;
    var value = domainMax - (range * ratio);
    return {
      value: value,
      label: Math.round(value)
    };
  });
};

const buildClassChartPoints = (chartData = [], domainMin = 0, domainMax = 100) => {
  var width = CLASS_CHART_DIMENSIONS.width;
  var height = CLASS_CHART_DIMENSIONS.height;
  var padding = CLASS_CHART_DIMENSIONS.padding;
  var plotWidth = width - padding.left - padding.right;
  var plotHeight = height - padding.top - padding.bottom;
  var range = Math.max(domainMax - domainMin, 1);

  return chartData.map(function (entry, index) {
    var ratio = chartData.length === 1 ? 0.5 : index / Math.max(chartData.length - 1, 1);
    var normalizedValue = (entry.score - domainMin) / range;

    return {
      name: entry.name,
      fullName: entry.fullName,
      score: entry.score,
      x: padding.left + (plotWidth * ratio),
      y: padding.top + (plotHeight * (1 - normalizedValue))
    };
  });
};

const buildClassChartPath = (points = []) => {
  if (!points.length) {
    return '';
  }

  return points.map(function (point, index) {
    return (index === 0 ? 'M ' : 'L ') + point.x.toFixed(2) + ' ' + point.y.toFixed(2);
  }).join(' ');
};

const buildClassChartAreaPath = (points = [], baselineY = 0) => {
  if (!points.length) {
    return '';
  }

  var linePath = buildClassChartPath(points);
  var firstPoint = points[0];
  var lastPoint = points[points.length - 1];

  return linePath
    + ' L ' + lastPoint.x.toFixed(2) + ' ' + baselineY.toFixed(2)
    + ' L ' + firstPoint.x.toFixed(2) + ' ' + baselineY.toFixed(2)
    + ' Z';
};

const setStudentChartEmptyState = (isEmpty = true) => {
  if (app.dom.canvas) {
    app.dom.canvas.style.display = isEmpty ? 'none' : 'block';
  }
  if (app.dom.chartPlaceholder) {
    app.dom.chartPlaceholder.style.display = isEmpty ? 'block' : 'none';
  }
};

const clearStudentChartCanvas = (ctx, width = 0, height = 0) => {
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, width, height);
};

const charts = {
  renderClassChart: function (data = [], hasData = false) {
    if (!app.dom.classChart) return;
    var mountNode = app.dom.classChart;
    var placeholder = app.dom.classChartPlaceholder;

    if (!hasData || !data.length) {
      mountNode.innerHTML = '';
      mountNode.style.display = 'none';
      mountNode.removeAttribute('data-renderer');
      if (placeholder) placeholder.style.display = 'flex';
      return;
    }

    mountNode.dataset.renderer = 'native-svg';
    mountNode.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    var palette = getClassChartPalette();
    var chartData = data.map(normalizeClassChartDatum);
    var scoreValues = chartData
      .map(function (entry) { return entry.score; })
      .filter(function (value) { return Number.isFinite(value); });
    var minScore = scoreValues.length ? Math.min.apply(null, scoreValues) : 0;
    var maxScore = scoreValues.length ? Math.max.apply(null, scoreValues) : 0;
    var domainMin = Math.max(0, Math.floor((minScore - 20) / 10) * 10);
    var domainMax = Math.ceil((maxScore + 20) / 10) * 10;
    var firstScore = chartData.length ? chartData[0].score : 0;
    var lastScore = chartData.length ? chartData[chartData.length - 1].score : 0;
    var trendDelta = lastScore - firstScore;
    var trendDirection = trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'flat';
    var trendPrefix = trendDelta > 0 ? '+' : '';
    var trendSymbol = trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '→';
    var trendText = trendSymbol + ' ' + trendPrefix + trendDelta.toFixed(1);
    var trendBackground = trendDirection === 'up'
      ? palette.trendUp
      : trendDirection === 'down'
        ? palette.trendDown
        : palette.trendFlat;
    var trendShadow = trendDirection === 'up'
      ? '0 4px 10px rgba(22, 163, 74, 0.2)'
      : trendDirection === 'down'
        ? '0 4px 10px rgba(220, 38, 38, 0.2)'
        : '0 4px 10px rgba(100, 116, 139, 0.2)';
    var ticks = buildClassChartTicks(domainMin, domainMax);
    var points = buildClassChartPoints(chartData, domainMin, domainMax);
    var width = CLASS_CHART_DIMENSIONS.width;
    var height = CLASS_CHART_DIMENSIONS.height;
    var padding = CLASS_CHART_DIMENSIONS.padding;
    var plotHeight = height - padding.top - padding.bottom;
    var baselineY = height - padding.bottom;
    var gridMarkup = ticks.map(function (tick, index) {
      var y = padding.top + ((plotHeight / 4) * index);
      return `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${palette.grid}" stroke-width="1" stroke-dasharray="4 4" opacity="0.65"></line>
        <text x="${padding.left - 10}" y="${y + 4}" fill="${palette.tick}" font-size="12" font-weight="600" text-anchor="end">${tick.label}</text>
      `;
    }).join('');
    var xLabelMarkup = points.map(function (point) {
      return `<text x="${point.x}" y="${height - 14}" fill="${palette.tick}" font-size="12" font-weight="600" text-anchor="middle">${escapeHtml(point.name)}</text>`;
    }).join('');
    var pointMarkup = points.map(function (point) {
      var labelY = Math.max(point.y - 12, 18);
      return `
        <g>
          <circle cx="${point.x}" cy="${point.y}" r="5" fill="${palette.pointFill}" stroke="${palette.pointStroke}" stroke-width="2.5">
            <title>${escapeHtml(point.fullName)}: ${escapeHtml(point.score.toFixed(1))}%</title>
          </circle>
          <text x="${point.x}" y="${labelY}" fill="${palette.pointLabel}" font-size="11" font-weight="700" text-anchor="middle">${escapeHtml(point.score.toFixed(1))}%</text>
        </g>
      `;
    }).join('');
    var linePath = buildClassChartPath(points);
    var areaPath = buildClassChartAreaPath(points, baselineY);

    mountNode.innerHTML = `
      <div style="background: linear-gradient(145deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%); padding: 24px 20px 16px; border-radius: 20px; border: 1px solid ${palette.border}; box-shadow: ${palette.shadow}; position: relative; overflow: hidden;">
        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%); pointer-events: none;"></div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 20px; padding: 0 4px; flex-wrap: wrap;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; color: ${palette.title}; font-family: 'Outfit', sans-serif;">Class Performance</h3>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${palette.tick}; opacity: 0.85;">Range ${Math.round(domainMin)}-${Math.round(domainMax)}%</span>
            <span style="font-size: 13px; font-weight: 800; color: #fff; background: ${trendBackground}; border-radius: 6px; padding: 3px 8px; box-shadow: ${trendShadow};">${escapeHtml(trendText)}</span>
          </div>
        </div>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Class performance trend chart" style="width: 100%; height: auto; display: block;">
          <defs>
            <linearGradient id="class-chart-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="${palette.lineStart}"></stop>
              <stop offset="100%" stop-color="${palette.lineEnd}"></stop>
            </linearGradient>
            <linearGradient id="class-chart-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${palette.areaStart}"></stop>
              <stop offset="100%" stop-color="${palette.areaEnd}"></stop>
            </linearGradient>
            <filter id="class-chart-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur"></feGaussianBlur>
              <feComposite in="SourceGraphic" in2="blur" operator="over"></feComposite>
            </filter>
          </defs>
          <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" stroke="${palette.axis}" stroke-width="1"></line>
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${baselineY}" stroke="${palette.axis}" stroke-width="1"></line>
          ${gridMarkup}
          <path d="${areaPath}" fill="url(#class-chart-area-gradient)"></path>
          <path d="${linePath}" fill="none" stroke="url(#class-chart-gradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#class-chart-glow)"></path>
          ${pointMarkup}
          ${xLabelMarkup}
        </svg>
      </div>
    `;
  },
  renderStudentChart: function (studentId) {
    if (!app.dom.canvas) return;
    var canvas = app.dom.canvas;
    var ctx = canvas.getContext('2d');
    var s = app.state.students.find(function (entry) { return entry.id === studentId; });

    if (!s || !ctx) {
      clearStudentChartCanvas(ctx, canvas.width || canvas.clientWidth || 0, canvas.height || canvas.clientHeight || 0);
      canvas.removeAttribute('data-renderer');
      setStudentChartEmptyState(true);
      return;
    }

    // Improve sharpness on high-DPI screens
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    var maxScore = app.state.subjects.length * 100;
    var points = [];
    app.state.exams.forEach(function (m, i) {
      var t = app.analytics.getTotal(s, m);
      if (t !== null) {
        var examName = m.title || m.name;
        var label = (examName && examName.toLowerCase().startsWith('mock ')) ? ('M' + (i + 1)) : examName;
        points.push({
          x: 50 + (i / (app.state.exams.length - 1 || 1)) * (w - 100),
          y: h - 50 - (t / maxScore) * (h - 100),
          val: t,
          name: label
        });
      }
    });
    if (points.length < 1) {
      canvas.removeAttribute('data-renderer');
      setStudentChartEmptyState(true);
      return;
    }

    canvas.dataset.renderer = 'native-canvas';
    setStudentChartEmptyState(false);

    var darkMode = document.body.classList.contains('dark-mode');
    var chartText = darkMode ? '#f8fafc' : '#0f172a';
    var chartSubText = darkMode ? '#cbd5e1' : '#64748b';
    var gridColor = darkMode ? '#334155' : '#e2e8f0';
    var lineColor = darkMode ? '#60a5fa' : '#3b82f6';
    var pointFill = darkMode ? '#020617' : '#fff';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = 30 + ((h - 80) / 4) * g;
      ctx.beginPath();
      ctx.moveTo(50, gy);
      ctx.lineTo(w - 20, gy);
      ctx.stroke();
    }

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Points
    points.forEach(function (p) {
      ctx.fillStyle = pointFill;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = chartText;
      ctx.font = 'bold 11px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(p.val, p.x, p.y - 12);
      ctx.fillStyle = chartSubText;
      ctx.font = '10px Inter';
      ctx.fillText(p.name, p.x, h - 15);
    });
  }
};

app.charts = charts;
export default charts;
