/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — heatmap.js
   Handles performance heatmap rendering.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.heatmap = {
    
    getHeatmapClass: function (score) {
      if (score === null || score === undefined) return '';
      if (score >= 70) return 'strong';
      if (score >= 50) return 'average';
      return 'weak';
    },

    renderHeatmap: function () {
      if (!app.dom.heatmapHead || !app.dom.heatmapBody) return;

      const headerHtml = '<th>Student</th>' + app.state.mocks.map(m => `<th>${app.utils.esc(m.name)}</th>`).join('');
      app.dom.heatmapHead.innerHTML = headerHtml;

      const bodyHtml = app.state.students.map(s => {
        let cells = app.state.mocks.map(m => {
          const total = app.analytics.mockTotal(s.scores[m.id]);
          const cls = this.getHeatmapClass(total);
          return `<td class="heatmap-score ${cls}">${total !== null ? total : '—'}</td>`;
        }).join('');
        return `<tr><td>${app.utils.esc(s.name)}</td>${cells}</tr>`;
      }).join('');
      
      app.dom.heatmapBody.innerHTML = bodyHtml;
    }
  };

})(window.TrackerApp);
