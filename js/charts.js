/* Charts - Enhanced with modern styling, labels, and grid */
(function (app) {
  'use strict';
  app.charts = {
    colors: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'],
    renderClassChart: function (data, hasData) {
      if (!app.dom.classChart) return;
      var canvas = app.dom.classChart;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!hasData) {
        canvas.style.display = 'none';
        if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'block';
        return;
      }
      canvas.style.display = 'block';
      if (app.dom.classChartPlaceholder) app.dom.classChartPlaceholder.style.display = 'none';
      var pad = { top: 30, right: 20, bottom: 50, left: 50 };
      var cw = w - pad.left - pad.right;
      var ch = h - pad.top - pad.bottom;
      // Grid lines
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
      for (var g = 0; g <= 4; g++) {
        var gy = pad.top + (ch / 4) * g;
        ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
        ctx.fillText((100 - g * 25) + '', pad.left - 8, gy + 4);
      }
      // Y-axis label
      ctx.save(); ctx.translate(12, h / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#64748b'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Average Score (%)', 0, 0); ctx.restore();
      // Bars
      var barW = Math.min(60, cw / data.length - 20);
      var gap = (cw - data.length * barW) / (data.length + 1);
      data.forEach(function(v, i) {
        var val = v.overall || 0;
        var bh = (val / 100) * ch;
        var x = pad.left + gap + i * (barW + gap);
        var y = pad.top + ch - bh;
        var color = app.charts.colors[i % app.charts.colors.length];
        // Bar shadow
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(x + 2, y + 2, barW, bh);
        // Bar
        ctx.fillStyle = color;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [4, 4, 0, 0]); ctx.fill(); }
        else { ctx.fillRect(x, y, barW, bh); }
        // Value on top
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center';
        ctx.fillText(val.toFixed(1), x + barW / 2, y - 8);
        // Label below
        ctx.fillStyle = '#64748b'; ctx.font = '11px Inter';
        ctx.fillText(v.name, x + barW / 2, pad.top + ch + 20);
      });
      // Title
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Class Average by Exam', w / 2, 18);
    },
    renderStudentChart: function (studentId) {
      var s = app.state.students.find(function(x) { return x.id === studentId; });
      if (!s || !app.dom.canvas) return;
      var canvas = app.dom.canvas;
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      var maxScore = app.state.subjects.length * 100;
      var points = [];
      app.state.mocks.forEach(function(m, i) {
        var t = app.analytics.mockTotal(s.scores[m.id]);
        if (t !== null) {
          points.push({
            x: 50 + (i / (app.state.mocks.length - 1 || 1)) * (w - 100),
            y: h - 50 - (t / maxScore) * (h - 100),
            val: t, name: m.name
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
      // Line
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach(function(p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      // Points
      points.forEach(function(p) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 11px Inter'; ctx.textAlign = 'center';
        ctx.fillText(p.val, p.x, p.y - 12);
        ctx.fillStyle = '#64748b'; ctx.font = '10px Inter';
        ctx.fillText(p.name, p.x, h - 15);
      });
    }
  };
})(window.TrackerApp);
