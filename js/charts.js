/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — charts.js
   Chart rendering and visualization.
   ═══════════════════════════════════════════════ */

import app from './state.js';
import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'https://esm.sh/recharts@2.12.7';

const charts = {
  colors: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'],
  renderClassChart: function (data, hasData) {
    if (!app.dom.classChart) return;
    var mountNode = app.dom.classChart;
    var placeholder = app.dom.classChartPlaceholder;

    if (!mountNode._rechartsRoot) {
      mountNode._rechartsRoot = createRoot(mountNode);
    }

    if (!hasData || !data.length) {
      mountNode._rechartsRoot.render(null);
      mountNode.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      return;
    }
    mountNode.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    var darkMode = document.body.classList.contains('dark-mode');
    var palette = darkMode
      ? {
          grid: '#334155',
          axis: '#475569',
          tick: '#cbd5f5',
          label: '#94a3b8',
          line: '#3b82f6',
          dotFill: '#0f172a',
          tooltipBg: '#0f172a'
        }
      : {
          grid: '#cbd5e1',
          axis: '#94a3b8',
          tick: '#334155',
          label: '#475569',
          line: '#2563eb',
          dotFill: '#ffffff',
          tooltipBg: '#0f172a'
        };

    var chartData = data.map(function (v, i) {
      var score = Number(v.overall || 0);
      var fullName = v.name || ('Exam ' + (i + 1));
      var shortName = (fullName && fullName.toLowerCase().startsWith('mock '))
        ? 'M' + (i + 1)
        : fullName;

      return {
        name: shortName,
        fullName: fullName,
        score: Number.isFinite(score) ? score : 0
      };
    });

    mountNode._rechartsRoot.render(
      React.createElement(
        ResponsiveContainer,
        { width: '100%', height: '100%' },
        React.createElement(
          LineChart,
          { data: chartData, margin: { top: 20, right: 18, left: 6, bottom: 6 } },
          React.createElement(CartesianGrid, {
            stroke: palette.grid,
            strokeDasharray: '4 4',
            vertical: false
          }),
          React.createElement(XAxis, {
            dataKey: 'name',
            tick: { fill: palette.tick, fontSize: 12, fontWeight: 600 },
            axisLine: { stroke: palette.axis },
            tickLine: false
          }),
          React.createElement(YAxis, {
            domain: [0, 'dataMax + 20'],
            tick: { fill: palette.tick, fontSize: 12, fontWeight: 600 },
            axisLine: { stroke: palette.axis },
            tickLine: false,
            width: 58,
            label: {
              value: 'Average Score',
              angle: -90,
              position: 'insideLeft',
              fill: palette.label,
              dx: -4,
              style: { fontSize: 12, fontWeight: 700 }
            }
          }),
          React.createElement(Tooltip, {
            formatter: function (value) {
              var num = Number(value);
              return [Number.isFinite(num) ? num.toFixed(1) : value, 'Average Score'];
            },
            labelFormatter: function (_, payload) {
              var point = payload && payload[0] ? payload[0].payload : null;
              return point?.fullName || point?.name || '';
            },
            contentStyle: {
              backgroundColor: palette.tooltipBg,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              boxShadow: '0 10px 22px rgba(2, 6, 23, 0.45)'
            },
            itemStyle: { color: '#e2e8f0' },
            labelStyle: { color: '#94a3b8' }
          }),
          React.createElement(Line, {
            type: 'monotone',
            dataKey: 'score',
            stroke: palette.line,
            strokeWidth: 3,
            dot: { r: 6, stroke: palette.line, strokeWidth: 2, fill: palette.dotFill },
            activeDot: { r: 8, stroke: palette.line, strokeWidth: 2, fill: palette.dotFill }
          })
        )
      )
    );
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
