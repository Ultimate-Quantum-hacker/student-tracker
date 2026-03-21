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
    if (!hasData) {
      canvas.style.display = 'none';
      if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'block';
      return;
    }
    canvas.style.display = 'block';
    if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'none';

    // Prepare pie data (overall averages per exam)
    var values = data.map(function (v) { return Math.max(0, v.overall || 0); });
    var labels = data.map(function (v, i) {
      return (v.name && v.name.toLowerCase().startsWith('mock '))
        ? 'M' + (i + 1)
        : v.name || ('Exam ' + (i + 1));
    });
    var total = values.reduce(function (sum, v) { return sum + v; }, 0) || 1;

    var radius = Math.min(w, h) * 0.32;
    var cx = w * 0.32;
    var cy = h * 0.55;

    // Draw pie slices
    var startAngle = -Math.PI / 2;
    var slices = [];
    values.forEach(function (val, i) {
      var sliceAngle = (val / total) * Math.PI * 2;
      var endAngle = startAngle + sliceAngle;
      var color = charts.colors[i % charts.colors.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      slices.push({
        start: startAngle,
        end: endAngle,
        label: labels[i],
        value: val
      });
      startAngle = endAngle;
    });

    var darkMode = document.body.classList.contains('dark-mode');
    var chartText = darkMode ? '#f8fafc' : '#0f172a';
    var chartSubText = darkMode ? '#cbd5e1' : '#475569';

    // Legend on the right
    var legendX = w * 0.65;
    var legendY = h * 0.3;
    ctx.font = '12px Inter';
    ctx.textAlign = 'left';
    labels.forEach(function (label, i) {
      var color = charts.colors[i % charts.colors.length];
      var y = legendY + i * 22;
      ctx.fillStyle = color;
      ctx.fillRect(legendX, y - 10, 14, 14);
      ctx.fillStyle = chartText;
      ctx.fillText(label + ' (' + values[i].toFixed(1) + '%)', legendX + 20, y + 1);
    });

    // Title
    ctx.fillStyle = chartText;
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Class Performance Across Mock Exams', w / 2, 24);

    // Tooltip via title on hover
    charts._classPieMeta = { cx: cx, cy: cy, radius: radius, slices: slices };
    if (!canvas._hasClassTooltipListener) {
      canvas.addEventListener('mousemove', function (evt) {
        var meta = charts._classPieMeta;
        if (!meta || !meta.slices) return;
        var r2 = canvas.getBoundingClientRect();
        var mx = evt.clientX - r2.left;
        var my = evt.clientY - r2.top;
        var dx = mx - meta.cx;
        var dy = my - meta.cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > meta.radius) {
          canvas.style.cursor = 'default';
          canvas.title = '';
          return;
        }
        var angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += 2 * Math.PI;
        var hovered = meta.slices.find(function (s) {
          return angle >= s.start && angle <= s.end;
        });
        if (hovered) {
          canvas.style.cursor = 'pointer';
          canvas.title = hovered.label + ': ' + hovered.value.toFixed(1) + '%';
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
