/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — heatmap.js
   Heatmap visualization for performance data.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const heatmap = {
  getHeatmapClass: function (score) {
    if (score === null || score === undefined || isNaN(score)) return '';
    if (score >= 70) return 'hm-strong';
    if (score >= 50) return 'hm-average';
    return 'hm-weak';
  },
  renderHeatmap: function () {
    if (!app.dom.heatmapHead || !app.dom.heatmapBody) return;
    var headerHtml = '<th class="hm-sticky">Student</th>';
    app.state.subjects.forEach(function(s) {
      headerHtml += '<th>' + app.utils.esc(s.name) + '</th>';
    });
    headerHtml += '<th>Overall</th>';
    app.dom.heatmapHead.innerHTML = headerHtml;
    var bodyHtml = '';
    app.state.students.forEach(function(s) {
      bodyHtml += '<tr><td class="hm-sticky hm-name">' + app.utils.esc(s.name) + '</td>';
      app.state.subjects.forEach(function(sub) {
        var sum = 0, count = 0;
        app.state.exams.forEach(function(m) {
          var val = app.analytics.getScore(s, sub, m);
          if (val !== '' && val !== null && val !== undefined && !isNaN(val)) { sum += Number(val); count++; }
        });
        var avg = count > 0 ? Math.round(sum / count) : null;
        var cls = heatmap.getHeatmapClass(avg);
        bodyHtml += '<td class="hm-cell ' + cls + '" title="' + app.utils.esc(sub.name) + ': ' + (avg !== null ? avg : 'N/A') + '">' + (avg !== null ? avg : '\u2014') + '</td>';
      });
      var avgs = app.analytics.calcAverages(s, app.state.subjects, app.state.exams);
      var overall = avgs.overall;
      var oCls = heatmap.getHeatmapClass(overall);
      bodyHtml += '<td class="hm-cell hm-overall ' + oCls + '">' + (overall !== null ? overall.toFixed(0) : '\u2014') + '</td></tr>';
    });
    app.dom.heatmapBody.innerHTML = bodyHtml;
  }
};

app.heatmap = heatmap;

// Export heatmap module
export default heatmap;
