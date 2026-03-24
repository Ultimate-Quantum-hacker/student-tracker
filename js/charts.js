/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — charts.js
   Chart rendering and visualization.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const charts = {
  colors: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'],
  renderClassChart: function (data, hasData) {
    if (!app.dom.classChart) return;
    var canvas = app.dom.classChart;
    var ctx = canvas.getContext('2d');

    // Improve sharpness on high-DPI screens
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    if (!hasData || !data.length) {
      canvas.style.display = 'none';
      if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'block';
      return;
    }
    canvas.style.display = 'block';
    if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'none';

    var darkMode = document.body.classList.contains('dark-mode');
    var chartText = darkMode ? '#f8fafc' : '#0f172a';
    var chartSubText = darkMode ? '#94a3b8' : '#64748b';
    var gridColor = darkMode ? 'rgba(248, 250, 252, 0.1)' : 'rgba(15, 23, 42, 0.06)';

    // Padding for axes
    var padding = { top: 40, right: 30, bottom: 40, left: 50 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;

    // Prepare data
    var points = data.map(function (v, i) {
      var score = v.overall || 0;
      var label = (v.name && v.name.toLowerCase().startsWith('mock ')) 
        ? 'M' + (i + 1) 
        : (v.name || ('E' + (i + 1)));
      
      return {
        val: score,
        label: label,
        fullName: v.name,
        x: padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2),
        y: padding.top + chartH - (score / 100) * chartH
      };
    });

    // Draw Grid Lines (Horizontal)
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '10px Inter';
    ctx.fillStyle = chartSubText;

    [0, 25, 50, 75, 100].forEach(function(tick) {
      var ty = padding.top + chartH - (tick / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, ty);
      ctx.lineTo(w - padding.right, ty);
      ctx.stroke();
      ctx.fillText(tick + '%', padding.left - 10, ty);
    });

    // Draw Line
    if (points.length > 1) {
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Use Bezier curves for smooth line if more than 2 points
      points.forEach(function(p, i) {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          // Add smooth curvature
          var prev = points[i-1];
          var cp1x = prev.x + (p.x - prev.x) / 2;
          ctx.bezierCurveTo(cp1x, prev.y, cp1x, p.y, p.x, p.y);
        }
      });
      ctx.stroke();

      // Draw Area under line
      ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
      ctx.lineTo(points[0].x, padding.top + chartH);
      ctx.closePath();
      var gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw Points and X-axis Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px Inter';

    points.forEach(function(p) {
      // Draw point
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw value above point
      ctx.fillStyle = chartText;
      ctx.fillText(p.val.toFixed(1) + '%', p.x, p.y - 18);

      // Draw label below axis
      ctx.fillStyle = chartSubText;
      ctx.font = '600 11px Inter';
      ctx.fillText(p.label, p.x, padding.top + chartH + 10);
    });

    // Save points for tooltip
    charts._classChartMeta = { points: points, padding: padding };

    if (!canvas._hasClassTooltipListener) {
      canvas.addEventListener('mousemove', function (evt) {
        var meta = charts._classChartMeta;
        if (!meta || !meta.points) return;
        var r2 = canvas.getBoundingClientRect();
        var mx = evt.clientX - r2.left;
        var my = evt.clientY - r2.top;
        
        var hovered = meta.points.find(function (p) {
          var dx = mx - p.x;
          var dy = my - p.y;
          return Math.sqrt(dx * dx + dy * dy) < 10;
        });

        if (hovered) {
          canvas.style.cursor = 'pointer';
          canvas.title = hovered.fullName + ': ' + hovered.val.toFixed(1) + '%';
        } else {
          canvas.style.cursor = 'default';
          canvas.title = '';
        }
      });
      canvas._hasClassTooltipListener = true;
    }
  },
  renderStudentChart: function (studentId) {
    var s = app.state.students.find(function(x) { return x.id === studentId; });
    if (!s || !app.dom.canvas) return;
    var canvas = app.dom.canvas;
    var ctx = canvas.getContext('2d');

    // Improve sharpness on high-DPI screens
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    var maxScore = app.state.subjects.length * 100;
    var points = [];
    app.state.exams.forEach(function(m, i) {
      var t = app.analytics.getTotal(s, m);
      if (t !== null) {
        var examName = m.title || m.name;
        var label = (examName && examName.toLowerCase().startsWith('mock ')) ? ('M' + (i + 1)) : examName;
        points.push({
          x: 50 + (i / (app.state.exams.length - 1 || 1)) * (w - 100),
          y: h - 50 - (t / maxScore) * (h - 100),
          val: t, name: label
        });
      }
    });
    if (points.length < 1) {
      canvas.style.display = 'none';
      if (app.dom.chartPlaceholder) app.dom.chartPlaceholder.style.display = 'block';
      return;
    }
    canvas.style.display = 'block';
    if (app.dom.chartPlaceholder) app.dom.chartPlaceholder.style.display = 'none';
    // Grid
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = 30 + ((h - 80) / 4) * g;
      ctx.beginPath(); ctx.moveTo(50, gy); ctx.lineTo(w - 20, gy); ctx.stroke();
    }
    var darkMode = document.body.classList.contains('dark-mode');
    var chartText = darkMode ? '#f8fafc' : '#0f172a';
    var chartSubText = darkMode ? '#cbd5e1' : '#64748b';

    // Line
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach(function(p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();
    // Points
    points.forEach(function(p) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = chartText; ctx.font = 'bold 11px Inter'; ctx.textAlign = 'center';
      ctx.fillText(p.val, p.x, p.y - 12);
      ctx.fillStyle = chartSubText; ctx.font = '10px Inter';
      ctx.fillText(p.name, p.x, h - 15);
    });
  }
};

app.charts = charts;
export default charts;
