/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — heatmap.js
   Heatmap visualization for performance data.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const heatmap = {
  uiState: {
    examId: '',
    category: 'all',
    sortBy: 'overall-desc',
    query: '',
    atRiskOnly: false
  },
  _eventsBound: false,

  getDom: function () {
    return {
      head: app.dom.heatmapHead,
      body: app.dom.heatmapBody,
      examContext: document.getElementById('heatmapExamContext'),
      examSelect: document.getElementById('heatmapExamSelect'),
      categoryFilter: document.getElementById('heatmapCategoryFilter'),
      searchInput: document.getElementById('heatmapSearchInput'),
      sortSelect: document.getElementById('heatmapSortSelect'),
      atRiskOnly: document.getElementById('heatmapAtRiskOnly'),
      insights: document.getElementById('heatmapInsights'),
      tooltip: document.getElementById('heatmapTooltip')
    };
  },

  getHeatmapCategoryKey: function (score) {
    if (score === null || score === undefined || isNaN(score)) return 'no-data';
    if (score >= 80) return 'strong';
    if (score >= 70) return 'good';
    if (score >= 60) return 'average';
    if (score >= 41) return 'borderline';
    return 'at-risk';
  },

  getHeatmapClass: function (score) {
    const key = this.getHeatmapCategoryKey(score);
    return key === 'no-data' ? 'hm-no-data' : `hm-${key}`;
  },

  getHeatmapLabel: function (score) {
    if (score === null || score === undefined || isNaN(score)) return 'No Data';
    if (score >= 80) return 'Strong';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Average';
    if (score >= 41) return 'Borderline';
    return 'At Risk';
  },

  getSelectedExam: function () {
    const exams = app.state.exams || [];
    if (!exams.length) return null;
    return exams.find(exam => exam.id === this.uiState.examId) || exams[exams.length - 1];
  },

  formatScore: function (score, digits) {
    if (score === null || score === undefined || isNaN(score)) return '—';
    const num = Number(score);
    if (!Number.isFinite(num)) return '—';
    if (digits === 0) return String(Math.round(num));
    return num.toFixed(digits);
  },

  buildSortOptions: function () {
    const base = [
      { value: 'overall-desc', label: 'Overall (High → Low)' },
      { value: 'overall-asc', label: 'Overall (Low → High)' },
      { value: 'name-asc', label: 'Student Name (A → Z)' },
      { value: 'name-desc', label: 'Student Name (Z → A)' }
    ];

    (app.state.subjects || []).forEach(subject => {
      const subjectName = app.analytics.getSubjectLabel(subject);
      base.push({ value: `subject:${subjectName}:desc`, label: `${subjectName} (High → Low)` });
      base.push({ value: `subject:${subjectName}:asc`, label: `${subjectName} (Low → High)` });
    });

    return base;
  },

  syncControls: function (dom) {
    if (!dom.examSelect || !dom.categoryFilter || !dom.sortSelect || !dom.searchInput || !dom.atRiskOnly) return;

    const exams = app.state.exams || [];
    const selectedExam = this.getSelectedExam();
    this.uiState.examId = selectedExam?.id || '';

    dom.examSelect.innerHTML = exams.length
      ? exams.map(exam => `<option value="${exam.id}">${app.utils.esc(app.analytics.getExamLabel(exam))}</option>`).join('')
      : '<option value="">No exams available</option>';
    dom.examSelect.disabled = !exams.length;
    dom.examSelect.value = this.uiState.examId;

    const sortOptions = this.buildSortOptions();
    const sortValues = sortOptions.map(option => option.value);
    if (!sortValues.includes(this.uiState.sortBy)) {
      this.uiState.sortBy = 'overall-desc';
    }
    dom.sortSelect.innerHTML = sortOptions
      .map(option => `<option value="${app.utils.esc(option.value)}">${app.utils.esc(option.label)}</option>`)
      .join('');
    dom.sortSelect.value = this.uiState.sortBy;

    dom.categoryFilter.value = this.uiState.category;
    dom.searchInput.value = this.uiState.query;
    dom.atRiskOnly.checked = !!this.uiState.atRiskOnly;

    if (dom.examContext) {
      const examLabel = selectedExam ? app.analytics.getExamLabel(selectedExam) : 'No exam selected';
      dom.examContext.textContent = `Heatmap - ${examLabel}`;
    }
  },

  getStudentRows: function (exam) {
    const subjects = app.state.subjects || [];

    return (app.state.students || []).map(student => {
      const subjectScores = {};
      let sum = 0;
      let count = 0;

      subjects.forEach(subject => {
        const subjectLabel = app.analytics.getSubjectLabel(subject);
        const value = exam ? app.analytics.getScore(student, subject, exam) : '';
        const num = value !== '' && value !== null && value !== undefined && !isNaN(value)
          ? Number(value)
          : null;
        subjectScores[subjectLabel] = num;
        if (num !== null) {
          sum += num;
          count++;
        }
      });

      const overall = count ? (sum / count) : null;
      const overallKey = this.getHeatmapCategoryKey(overall);
      const overallLabel = this.getHeatmapLabel(overall);

      return {
        id: student.id,
        name: student.name,
        subjectScores,
        overall,
        overallKey,
        overallLabel
      };
    });
  },

  applyFiltersAndSorting: function (rows) {
    const query = (this.uiState.query || '').trim().toLowerCase();
    const category = this.uiState.category;
    const atRiskOnly = !!this.uiState.atRiskOnly;

    let filtered = rows.filter(row => {
      if (query && !row.name.toLowerCase().includes(query)) return false;
      if (category !== 'all' && row.overallKey !== category) return false;
      if (atRiskOnly && row.overallKey !== 'borderline' && row.overallKey !== 'at-risk') return false;
      return true;
    });

    const sortBy = this.uiState.sortBy || 'overall-desc';
    filtered = filtered.sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);

      if (sortBy === 'overall-asc' || sortBy === 'overall-desc') {
        const av = a.overall;
        const bv = b.overall;
        if (av === null && bv === null) return a.name.localeCompare(b.name);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return a.name.localeCompare(b.name);
        return sortBy.endsWith('asc') ? av - bv : bv - av;
      }

      if (sortBy.startsWith('subject:')) {
        const parts = sortBy.split(':');
        const direction = parts.pop();
        const subjectName = parts.slice(1).join(':');
        const av = a.subjectScores[subjectName];
        const bv = b.subjectScores[subjectName];
        if (av === null && bv === null) return a.name.localeCompare(b.name);
        if (av === null) return 1;
        if (bv === null) return -1;
        if (av === bv) return a.name.localeCompare(b.name);
        return direction === 'asc' ? av - bv : bv - av;
      }

      return 0;
    });

    return filtered;
  },

  renderInsights: function (dom, rows, exam) {
    if (!dom.insights) return;
    const subjects = app.state.subjects || [];
    const examLabel = exam ? app.analytics.getExamLabel(exam) : 'No exam selected';

    if (!exam || !subjects.length || !rows.length) {
      dom.insights.innerHTML = '<div class="heatmap-insight-empty">Add exams, subjects, and scores to unlock subject insights.</div>';
      return;
    }

    const subjectStats = subjects.map(subject => {
      const subjectLabel = app.analytics.getSubjectLabel(subject);
      const values = rows
        .map(row => row.subjectScores[subjectLabel])
        .filter(value => value !== null && value !== undefined && !isNaN(value));
      const avg = values.length
        ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
        : null;
      const lowCount = rows.reduce((count, row) => {
        const score = row.subjectScores[subjectLabel];
        const key = this.getHeatmapCategoryKey(score);
        return (key === 'borderline' || key === 'at-risk') ? count + 1 : count;
      }, 0);

      return { name: subjectLabel, avg, lowCount };
    });

    const averageStats = subjectStats.filter(stat => stat.avg !== null);
    const bestSubject = averageStats.length
      ? averageStats.reduce((best, current) => current.avg > best.avg ? current : best)
      : null;
    const weakestSubject = averageStats.length
      ? averageStats.reduce((weakest, current) => current.avg < weakest.avg ? current : weakest)
      : null;

    const riskRows = subjectStats
      .filter(stat => stat.lowCount > 0)
      .sort((a, b) => b.lowCount - a.lowCount || a.name.localeCompare(b.name));

    const riskHtml = riskRows.length
      ? riskRows
        .map(stat => `<li><strong>${app.utils.esc(stat.name)}</strong> has ${stat.lowCount} borderline/at-risk student${stat.lowCount === 1 ? '' : 's'}</li>`)
        .join('')
      : '<li>No subjects currently have borderline or at-risk students for this exam.</li>';

    dom.insights.innerHTML = `
      <div class="heatmap-insight-card">
        <div class="heatmap-insight-title">Subject Insights (${app.utils.esc(examLabel)})</div>
        <div class="heatmap-insight-lines">
          <p><span>Best Subject</span><strong>${bestSubject ? `${app.utils.esc(bestSubject.name)} (Avg: ${bestSubject.avg.toFixed(1)})` : 'N/A'}</strong></p>
          <p><span>Weakest Subject</span><strong>${weakestSubject ? `${app.utils.esc(weakestSubject.name)} (Avg: ${weakestSubject.avg.toFixed(1)})` : 'N/A'}</strong></p>
        </div>
      </div>
      <div class="heatmap-insight-card heatmap-risk-card">
        <div class="heatmap-insight-title">Risk Indicators</div>
        <ul class="heatmap-risk-list">${riskHtml}</ul>
      </div>
    `;
  },

  renderTable: function (dom, rows, exam) {
    if (!dom.head || !dom.body) return;
    const subjects = app.state.subjects || [];

    let headerHtml = '<th class="hm-sticky">Student</th>';
    subjects.forEach(subject => {
      headerHtml += `<th>${app.utils.esc(app.analytics.getSubjectLabel(subject))}</th>`;
    });
    headerHtml += '<th>Overall</th>';
    dom.head.innerHTML = headerHtml;

    if (!rows.length) {
      dom.body.innerHTML = `<tr><td colspan="${subjects.length + 2}" class="hm-empty">No students match the selected filters.</td></tr>`;
      return;
    }

    dom.body.innerHTML = rows.map(row => {
      const name = app.utils.esc(row.name);
      const cells = subjects.map(subject => {
        const subjectLabel = app.analytics.getSubjectLabel(subject);
        const value = row.subjectScores[subjectLabel];
        const category = this.getHeatmapLabel(value);
        const cssClass = this.getHeatmapClass(value);
        const tooltip = `${row.name} - ${subjectLabel}: ${value !== null ? this.formatScore(value, 0) : 'N/A'} (${category})`;
        return `<td class="hm-cell ${cssClass}" data-tooltip="${app.utils.esc(tooltip)}" title="${app.utils.esc(tooltip)}">${this.formatScore(value, 0)}</td>`;
      }).join('');

      const overallTooltip = `${row.name} - Overall (${exam ? app.analytics.getExamLabel(exam) : 'N/A'}): ${row.overall !== null ? this.formatScore(row.overall, 1) : 'N/A'} (${row.overallLabel})`;
      return `
        <tr class="hm-row" data-student-id="${row.id}">
          <td class="hm-sticky hm-name" title="Open ${name} report">${name}</td>
          ${cells}
          <td class="hm-cell hm-overall ${this.getHeatmapClass(row.overall)}" data-tooltip="${app.utils.esc(overallTooltip)}" title="${app.utils.esc(overallTooltip)}">
            <div class="hm-overall-wrap">
              <strong>${this.formatScore(row.overall, 1)}</strong>
              <span class="hm-category-badge hm-badge-${row.overallKey}">${app.utils.esc(row.overallLabel)}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  positionTooltip: function (tooltip, event) {
    if (!tooltip) return;
    const offset = 14;
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 10;
    const maxTop = window.innerHeight - tooltip.offsetHeight - 10;
    const left = Math.min(event.clientX + offset, Math.max(8, maxLeft));
    const top = Math.min(event.clientY + offset, Math.max(8, maxTop));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  },

  hideTooltip: function () {
    const tooltip = document.getElementById('heatmapTooltip');
    if (!tooltip) return;
    tooltip.classList.remove('active');
    tooltip.textContent = '';
  },

  bindEvents: function () {
    if (this._eventsBound) return;
    const dom = this.getDom();
    if (!dom.body) return;

    if (dom.examSelect) {
      dom.examSelect.addEventListener('change', () => {
        this.uiState.examId = dom.examSelect.value || '';
        this.renderHeatmap();
      });
    }
    if (dom.categoryFilter) {
      dom.categoryFilter.addEventListener('change', () => {
        this.uiState.category = dom.categoryFilter.value || 'all';
        this.renderHeatmap();
      });
    }
    if (dom.sortSelect) {
      dom.sortSelect.addEventListener('change', () => {
        this.uiState.sortBy = dom.sortSelect.value || 'overall-desc';
        this.renderHeatmap();
      });
    }
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', () => {
        this.uiState.query = dom.searchInput.value || '';
        this.renderHeatmap();
      });
    }
    if (dom.atRiskOnly) {
      dom.atRiskOnly.addEventListener('change', () => {
        this.uiState.atRiskOnly = !!dom.atRiskOnly.checked;
        this.renderHeatmap();
      });
    }

    dom.body.addEventListener('click', (event) => {
      const row = event.target.closest('.hm-row[data-student-id]');
      if (!row) return;
      const studentId = row.dataset.studentId;
      if (!studentId || !app.ui || typeof app.ui.openReport !== 'function') return;
      app.ui.openReport(studentId);
    });

    dom.body.addEventListener('mousemove', (event) => {
      const tooltip = document.getElementById('heatmapTooltip');
      if (!tooltip) return;
      const cell = event.target.closest('.hm-cell[data-tooltip]');
      if (!cell || !dom.body.contains(cell)) {
        this.hideTooltip();
        return;
      }

      tooltip.textContent = cell.dataset.tooltip || '';
      tooltip.classList.add('active');
      this.positionTooltip(tooltip, event);
    });

    dom.body.addEventListener('mouseleave', () => this.hideTooltip());
    window.addEventListener('scroll', () => this.hideTooltip(), { passive: true });

    this._eventsBound = true;
  },

  renderHeatmap: function () {
    const dom = this.getDom();
    if (!dom.head || !dom.body) return;

    this.bindEvents();
    this.syncControls(dom);

    const selectedExam = this.getSelectedExam();
    const allRows = this.getStudentRows(selectedExam);
    const visibleRows = this.applyFiltersAndSorting(allRows);

    this.renderInsights(dom, allRows, selectedExam);
    this.renderTable(dom, visibleRows, selectedExam);
  }
};

app.heatmap = heatmap;

// Export heatmap module
export default heatmap;
