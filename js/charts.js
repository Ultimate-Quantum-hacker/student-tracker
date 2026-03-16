/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — charts.js
   Handles all canvas-based rendering for charts.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.charts = {
    
    renderClassChart: function (data, hasData) {
      if (!app.dom.classChart) return;
      const canvas = app.dom.classChart;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      
      ctx.clearRect(0, 0, w, h);
      
      if (!hasData) {
        app.dom.classChart.style.display = 'none';
        app.dom.classChartPlaceholder.style.display = 'block';
        return;
      }
      app.dom.classChart.style.display = 'block';
      app.dom.classChartPlaceholder.style.display = 'none';

      const padding = 40;
      const barW = 40;
      const gap = (w - padding * 2 - data.length * barW) / (data.length + 1);
      
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, h - padding);
      ctx.lineTo(w - padding, h - padding);
      ctx.stroke();

      data.forEach((v, i) => {
        const val = v.overall || 0;
        const bh = (val / 100) * (h - padding * 2);
        const x = padding + gap + i * (barW + gap);
        const y = h - padding - bh;
        
        ctx.fillStyle = '#4f6ef7';
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, bh, [4, 4, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, bh);
        }

        ctx.fillStyle = '#666';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(v.name.slice(0, 5), x + barW / 2, h - padding + 15);
      });
    },

    renderStudentChart: function (studentId) {
      const s = app.state.students.find(x => x.id === studentId);
      if (!s || !app.dom.canvas) return;
      
      const canvas = app.dom.canvas;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const points = app.state.mocks.map((m, i) => {
        const t = app.analytics.mockTotal(s.scores[m.id]);
        if (t === null) return null;
        const maxScore = app.state.subjects.length * 100;
        return {
          x: 40 + (i / (app.state.mocks.length - 1 || 1)) * (w - 80),
          y: h - 40 - (t / maxScore) * (h - 80)
        };
      }).filter(p => p !== null);

      if (points.length < 1) {
        app.dom.canvas.style.display = 'none';
        app.dom.chartPlaceholder.style.display = 'block';
        return;
      }
      app.dom.canvas.style.display = 'block';
      app.dom.chartPlaceholder.style.display = 'none';

      // Line
      ctx.strokeStyle = '#4f6ef7';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Points
      points.forEach(p => {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#4f6ef7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  };

})(window.TrackerApp);
