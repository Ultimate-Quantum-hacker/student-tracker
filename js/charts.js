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
          cardFrom: '#0f172a',
          cardTo: '#1e293b',
          border: '#334155',
          title: '#f8fafc',
          tick: '#94a3b8',
          grid: '#1e293b',
          line: '#3b82f6',
          dotFill: '#020617',
          tooltipBg: '#020617',
          tooltipBorder: '#1e293b',
          trendUp: '#4ade80',
          trendDown: '#f87171'
        }
      : {
          cardFrom: '#f8fafc',
          cardTo: '#e2e8f0',
          border: '#cbd5e1',
          title: '#0f172a',
          tick: '#475569',
          grid: '#cbd5e1',
          line: '#2563eb',
          dotFill: '#ffffff',
          tooltipBg: '#0f172a',
          tooltipBorder: '#334155',
          trendUp: '#16a34a',
          trendDown: '#dc2626'
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

    var scoreValues = chartData
      .map(function (d) { return d.score; })
      .filter(function (v) { return Number.isFinite(v); });
    var minScore = scoreValues.length ? Math.min.apply(null, scoreValues) : 0;
    var maxScore = scoreValues.length ? Math.max.apply(null, scoreValues) : 0;
    var domainMin = Math.max(0, Math.floor((minScore - 20) / 10) * 10);
    var domainMax = Math.ceil((maxScore + 20) / 10) * 10;
    var firstScore = chartData.length ? chartData[0].score : 0;
    var lastScore = chartData.length ? chartData[chartData.length - 1].score : 0;
    var trendDelta = lastScore - firstScore;
    var trendPrefix = trendDelta > 0 ? '+' : '';
    var trendDirection = trendDelta < 0 ? 'down' : 'up';
    var trendText = (trendDirection === 'up' ? '↑ ' : '↓ ') + trendPrefix + trendDelta.toFixed(1);

    mountNode._rechartsRoot.render(
      React.createElement(
        'div',
        {
          style: {
            background: `linear-gradient(135deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
            padding: '18px 18px 14px',
            borderRadius: '16px',
            border: `1px solid ${palette.border}`,
            boxShadow: darkMode ? '0 14px 32px rgba(2, 6, 23, 0.55)' : '0 14px 30px rgba(15, 23, 42, 0.14)'
          }
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px'
            }
          },
          React.createElement(
            'h3',
            {
              style: {
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.01em',
                color: palette.title
              }
            },
            'Class Performance Chart'
          ),
          React.createElement(
            'span',
            {
              style: {
                fontSize: '12px',
                fontWeight: 700,
                color: trendDirection === 'up' ? palette.trendUp : palette.trendDown,
                background: darkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.65)',
                border: `1px solid ${palette.border}`,
                borderRadius: '999px',
                padding: '4px 9px'
              }
            },
            trendText
          )
        ),
        React.createElement(
          ResponsiveContainer,
          { width: '100%', height: 320 },
          React.createElement(
            LineChart,
            { data: chartData, margin: { top: 8, right: 22, left: 8, bottom: 12 } },
            React.createElement('defs', null,
              React.createElement('linearGradient', { id: 'classPerformanceLine', x1: '0', y1: '0', x2: '0', y2: '1' },
                React.createElement('stop', { offset: '0%', stopColor: '#3B82F6', stopOpacity: 1 }),
                React.createElement('stop', { offset: '100%', stopColor: '#3B82F6', stopOpacity: 0.2 })
              )
            ),
            React.createElement(CartesianGrid, {
              stroke: palette.grid,
              strokeDasharray: '3 3',
              vertical: false
            }),
            React.createElement(XAxis, {
              dataKey: 'name',
              tick: { fill: palette.tick, fontSize: 13, fontWeight: 600 },
              axisLine: false,
              tickLine: false
            }),
            React.createElement(YAxis, {
              domain: [domainMin, domainMax],
              tickFormatter: function (value) { return Math.round(value); },
              tick: { fill: palette.tick, fontSize: 13, fontWeight: 600 },
              axisLine: false,
              tickLine: false,
              width: 48
            }),
            React.createElement(Tooltip, {
              formatter: function (value) {
                var num = Number(value);
                return `${Number.isFinite(num) ? num.toFixed(1) : value} pts`;
              },
              labelFormatter: function (_, payload) {
                var point = payload && payload[0] ? payload[0].payload : null;
                return point?.fullName || point?.name || '';
              },
              contentStyle: {
                backgroundColor: palette.tooltipBg,
                border: `1px solid ${palette.tooltipBorder}`,
                borderRadius: '10px',
                color: '#fff',
                fontSize: '12px',
                boxShadow: '0 10px 22px rgba(2, 6, 23, 0.45)'
              },
              labelStyle: { color: '#94A3B8', fontWeight: 600 },
              itemStyle: { color: '#e2e8f0', fontWeight: 600 }
            }),
            React.createElement(Line, {
              type: 'monotone',
              dataKey: 'score',
              stroke: 'url(#classPerformanceLine)',
              strokeWidth: 3,
              dot: { r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: palette.dotFill },
              activeDot: {
                r: 8,
                stroke: '#3B82F6',
                strokeWidth: 2,
                fill: palette.dotFill,
                style: { filter: 'drop-shadow(0 0 6px #3B82F6)' }
              }
            })
          )
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
