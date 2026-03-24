/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — ui.js
   Handles all DOM manipulation and UI logic.
   ═══════════════════════════════════════════════ */

import app from './state.js';

// DOM Node References
app.dom = {};
const domIds = {
  backupBtn: 'backup-btn',
  restoreBtn: 'restore-btn',
  restoreInput: 'restore-input',
  createSnapshotBtn: 'create-snapshot-btn',
  snapshotManagerBtn: 'snapshot-manager-btn',
  snapshotModal: 'snapshot-modal',
  snapshotList: 'snapshot-list',
  snapshotCloseBtn: 'snapshot-close-btn',
  themeToggle: 'themeToggle',
  resetBtn: 'reset-btn',
  resetModal: 'reset-modal',
  resetConfirmBtn: 'reset-confirm-btn',
  resetCancelBtn: 'reset-cancel-btn',
  backupStatus: 'backupStatus',
  form: 'add-student-form',
  nameInput: 'student-name-input',
  searchInput: 'search-input',
  scoreStudentSelect: 'score-student-select',
  scoreMockSelect: 'scoreMockSelect',
  chartStudentSelect: 'chart-student-select',
  bulkMockSelect: 'bulkMockSelect',
  studentList: 'student-list',
  resultsBody: 'results-body',
  resultsHeadRow1: 'results-head-row-1',
  resultsHeadRow2: 'results-head-row-2',
  emptyMsg: 'empty-msg',
  classSummaryCards: 'class-summary-cards',
  classInsightBox: 'class-insight-box',
  toast: 'toast',
  mockList: 'mockList',
  addMockForm: 'addMockForm',
  mockNameInput: 'mockNameInput',
  subjectList: 'subjectList',
  addSubjectForm: 'addSubjectForm',
  subjectNameInput: 'subjectNameInput',
  statTotalStudents: 'stat-total-students',
  statClassAvg: 'stat-class-avg',
  statPassRate: 'stat-pass-rate',
  statFailRate: 'stat-fail-rate',
  statStrongCount: 'stat-strong-count',
  statGoodCount: 'stat-good-count',
  statAverageCount: 'stat-average-count',
  statBorderlineCount: 'stat-borderline-count',
  statAtRiskCount: 'stat-at-risk-count',
  statAtRiskCountSummary: 'stat-at-risk-count-summary',
  dashboardPerformanceSummary: 'dashboard-performance-summary',
  dashboardPerformanceChart: 'dashboard-performance-chart',
  classChart: 'class-chart',
  classChartPlaceholder: 'class-chart-placeholder',
  canvas: 'progress-chart',
  chartPlaceholder: 'chart-placeholder',
  heatmapHead: 'heatmapHead',
  heatmapBody: 'heatmapBody',
  editModal: 'edit-modal',
  editInput: 'edit-name-input',
  editSaveBtn: 'edit-save-btn',
  editCancelBtn: 'edit-cancel-btn',
  deleteModal: 'delete-modal',
  deleteConfirmMsg: 'delete-confirm-msg',
  deleteConfirmBtn: 'delete-confirm-btn',
  deleteCancelBtn: 'delete-cancel-btn',
  bulkImportBtn: 'bulk-import-btn',
  bulkImportModal: 'bulk-import-modal',
  bulkImportTextarea: 'bulk-import-textarea',
  bulkImportConfirmBtn: 'bulk-import-confirm-btn',
  bulkImportCancelBtn: 'bulk-import-cancel-btn',
  notesModal: 'notes-modal',
  notesModalTitle: 'notes-modal-title',
  notesTextarea: 'notes-textarea',
  notesSaveBtn: 'notes-save-btn',
  notesCancelBtn: 'notes-cancel-btn',
  bulkScoreBtn: 'bulk-score-btn',
  bulkScoreModal: 'bulk-score-modal',
  bulkScoreBody: 'bulkScoreBody',
  bulkScoreSaveBtn: 'bulk-score-save-btn',
  bulkScoreCancelBtn: 'bulk-score-cancel-btn',
  reportModal: 'report-modal',
  reportContainer: 'report-card-container',
  reportPrintBtn: 'report-print-btn',
  reportCloseBtn: 'report-close-btn',
  exportCsvBtn: 'export-csv-btn',
  exportExcelBtn: 'export-excel-btn',
  printBtn: 'print-btn',
  saveScoresBtn: 'save-scores-btn',
  dynamicSubjectFields: 'dynamicSubjectFields',
  bulkScoreHead: 'bulkScoreHead',
  performanceCategorySelect: 'performance-category-select',
  performanceCategoryCounts: 'performance-category-counts',
  performanceFilteredList: 'performance-filtered-list',
  performanceInterventionNeededList: 'performance-intervention-needed-list'
};

const ui = {

    init: function () {
      console.log('UI init running');
      this.initDOM();
      if (app.applyTheme) {
        app.applyTheme();
      }
    },
    
    initDOM: function () {
      console.log("Initializing DOM references...");
      Object.keys(domIds).forEach(k => {
        const el = document.getElementById(domIds[k]);
        if (!el) {
          console.warn(`DOM element not found: ${domIds[k]} (key: ${k})`);
        }
        app.dom[k] = el;
      });
    },

    showToast: function (m) {
      if (!app.dom.toast) return;
      app.dom.toast.textContent = m;
      app.dom.toast.classList.add('show');
      setTimeout(() => app.dom.toast.classList.remove('show'), 2000);
    },

    formatImprovement: function (current, previous) {
      if (previous === null || previous === undefined || isNaN(previous) || current === null || current === undefined || isNaN(current)) {
        return { text: 'N/A', className: 'improv-neutral' };
      }
      const diff = Number(current) - Number(previous);
      if (isNaN(diff)) return { text: 'N/A', className: 'improv-neutral' };
      if (diff > 0) return { text: '+' + diff.toFixed(1), className: 'improv-up' };
      if (diff < 0) return { text: diff.toFixed(1), className: 'improv-down' };
      return { text: '0', className: 'improv-neutral' };
    },

    formatStatusLabel: function (statusType) {
      if (statusType === 'strong') return 'Strong';
      if (statusType === 'good') return 'Good';
      if (statusType === 'average') return 'Average';
      if (statusType === 'borderline') return 'Borderline';
      if (statusType === 'at-risk') return 'At Risk';
      if (statusType === 'incomplete') return 'N/A';
      if (statusType === 'no-data') return 'No Data';
      if (statusType === 'safe') return 'Safe';
      return 'No Data';
    },

    clearAllData: async function () {
      if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
        app.snapshots.saveSnapshot('Auto Backup Before Reset');
      }
      app.applyRawData({ students: [], subjects: [], exams: [] });
      app.state.selectedBulkExamId = '';
      app.state.selectedPerformanceCategory = 'strong';
      await app.save();
      this.refreshUI();
      this.showToast('All data cleared');
    },

    createSnapshot: function (name = 'Manual Restore Point', refreshList = false) {
      if (!app.snapshots || typeof app.snapshots.saveSnapshot !== 'function') {
        this.showToast('Snapshot system unavailable');
        return null;
      }

      const snapshot = app.snapshots.saveSnapshot(name);
      if (snapshot && refreshList) {
        this.renderSnapshotList();
      }
      return snapshot;
    },

    formatSnapshotDate: function (value) {
      if (!value) return 'Unknown date';
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) return app.utils.esc(String(value));
      return parsed.toLocaleString();
    },

    renderSnapshotList: function () {
      if (!app.dom.snapshotList) return;

      const snapshots = app.snapshots && typeof app.snapshots.getSnapshots === 'function'
        ? app.snapshots.getSnapshots()
        : [];

      if (!snapshots.length) {
        app.dom.snapshotList.innerHTML = '<p class="snapshot-empty">No restore points available yet.</p>';
        return;
      }

      app.dom.snapshotList.innerHTML = snapshots.map(snapshot => `
        <div class="snapshot-item">
          <div class="snapshot-item-main">
            <div class="snapshot-name">${app.utils.esc(snapshot.name || 'Restore Point')}</div>
            <div class="snapshot-date">${app.utils.esc(this.formatSnapshotDate(snapshot.date))}</div>
          </div>
          <div class="snapshot-item-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-snapshot-action="restore" data-snapshot-id="${app.utils.esc(snapshot.id)}">Restore</button>
            <button class="btn btn-danger btn-sm" type="button" data-snapshot-action="delete" data-snapshot-id="${app.utils.esc(snapshot.id)}">Delete</button>
          </div>
        </div>
      `).join('');
    },

    openSnapshotModal: function () {
      this.renderSnapshotList();
      if (app.dom.snapshotModal) {
        app.dom.snapshotModal.classList.add('active');
      }
    },

    closeSnapshotModal: function () {
      if (app.dom.snapshotModal) {
        app.dom.snapshotModal.classList.remove('active');
      }
    },

    updateBackupStatus: function () {
      if (!app.dom.backupStatus) return;
      if (!app.state.lastBackup) {
        app.dom.backupStatus.textContent = 'Last Backup: Never ⚠';
        return;
      }
      const last = new Date(app.state.lastBackup);
      const diffDays = Math.floor((new Date() - last) / (1000 * 60 * 60 * 24));
      app.dom.backupStatus.textContent = `Last Backup: ${diffDays === 0 ? 'Today' : diffDays + ' days ago'}`;
    },

    updateDashboardStats: function () {
      const total = app.state.students.length;
      if (app.dom.statTotalStudents) app.dom.statTotalStudents.textContent = total;

      const latestExam = app.analytics.getLatestExam();
      const { groups: statusGroups } = app.analytics.groupStudentsByStatus(latestExam);
      const categories = app.analytics.getPerformanceCategories();
      const measured = (app.state.students || [])
        .map(student => app.analytics.getStudentAverageForExam(student, latestExam))
        .filter(avg => avg !== null && avg !== undefined && !isNaN(avg));

      const sum = measured.reduce((acc, value) => acc + Number(value), 0);
      const count = measured.length;
      const pass = measured.filter(avg => avg >= 50).length;
      const atRisk = (statusGroups['at-risk'] || []).length;
      const countTargets = {
        strong: 'statStrongCount',
        good: 'statGoodCount',
        average: 'statAverageCount',
        borderline: 'statBorderlineCount',
        'at-risk': 'statAtRiskCountSummary'
      };

      if (app.dom.statClassAvg) app.dom.statClassAvg.textContent = count ? (sum / count).toFixed(1) : '0.0';
      if (app.dom.statPassRate) app.dom.statPassRate.textContent = count ? Math.round((pass / count) * 100) + '%' : '0%';
      if (app.dom.statFailRate) app.dom.statFailRate.textContent = count ? Math.round(((count - pass) / count) * 100) + '%' : '0%';
      if (app.dom.statAtRiskCount) app.dom.statAtRiskCount.textContent = atRisk;

      categories.forEach(category => {
        const domKey = countTargets[category.key];
        if (domKey && app.dom[domKey]) {
          app.dom[domKey].textContent = (statusGroups[category.key] || []).length;
        }
      });

      this.renderDashboardPerformanceChart(statusGroups, categories);
    },

    renderDashboardPerformanceChart: function (statusGroups, categories) {
      if (!app.dom.dashboardPerformanceChart) return;

      const categoryCounts = (categories || []).map(category => ({
        ...category,
        count: (statusGroups?.[category.key] || []).length
      }));
      const maxCount = categoryCounts.reduce((max, item) => Math.max(max, item.count), 0);
      const step = Math.max(1, Math.ceil(Math.max(maxCount, 4) / 4));
      const scaleTop = step * 4;
      const yTicks = [4, 3, 2, 1, 0].map(multiplier => multiplier * step);

      const yAxisHtml = yTicks
        .map(tick => `<span class="dashboard-chart-tick">${tick}</span>`)
        .join('');

      const barsHtml = categoryCounts.map(item => {
        const barHeight = item.count > 0
          ? Math.max((item.count / scaleTop) * 100, 6)
          : 0;
        const tooltip = `${item.label} - ${item.count} student${item.count === 1 ? '' : 's'}`;

        return `
          <div class="dashboard-chart-col">
            <div class="dashboard-chart-col-inner">
              <div class="dashboard-chart-value">${item.count}</div>
              <div class="dashboard-chart-bar risk-${item.key}" style="height:${barHeight}%" title="${app.utils.esc(tooltip)}" aria-label="${app.utils.esc(tooltip)}"></div>
            </div>
            <div class="dashboard-chart-label">${item.label}</div>
          </div>
        `;
      }).join('');

      app.dom.dashboardPerformanceChart.innerHTML = `
        <div class="dashboard-chart-inner">
          <div class="dashboard-chart-y-axis" aria-label="Student count axis">
            ${yAxisHtml}
          </div>
          <div class="dashboard-chart-plot" aria-label="Category distribution bars">
            ${barsHtml}
          </div>
        </div>
      `;
    },

    renderStudentChips: function () {
      if (!app.dom.studentList) return;
      app.dom.studentList.innerHTML = app.state.students.map(s => `
        <div class="student-chip ${s.notes ? 'chip-has-notes' : ''}">
          <span>${app.utils.esc(s.name)}</span>
          <button onclick="window.TrackerApp.students.startEdit('${s.id}')">✎</button>
          <button onclick="window.TrackerApp.students.deleteStudent('${s.id}')">×</button>
        </div>`).join('');
    },

    populateSelects: function () {
      const selectedScoreExamId = app.dom.scoreMockSelect?.value || '';
      const selectedBulkExamId = app.dom.bulkMockSelect?.value || app.state.selectedBulkExamId || '';
      const selectedScoreStudentId = app.dom.scoreStudentSelect?.value || '';
      const selectedChartStudentId = app.dom.chartStudentSelect?.value || '';

      const mOps = app.state.exams.map(m => `<option value="${m.id}">${app.utils.esc(m.title || m.name)}</option>`).join('');
      if (app.dom.scoreMockSelect) {
        app.dom.scoreMockSelect.innerHTML = mOps;
        app.dom.scoreMockSelect.value = app.state.exams.some(m => m.id === selectedScoreExamId)
          ? selectedScoreExamId
          : (app.state.exams[0]?.id || '');
      }
      if (app.dom.bulkMockSelect) {
        app.dom.bulkMockSelect.innerHTML = mOps;
        app.dom.bulkMockSelect.value = app.state.exams.some(m => m.id === selectedBulkExamId)
          ? selectedBulkExamId
          : (app.state.exams[0]?.id || '');
        app.state.selectedBulkExamId = app.dom.bulkMockSelect.value || '';
      }
      
      const sOps = '<option value="">— Select Student —</option>' + app.state.students.map(s => `<option value="${s.id}">${app.utils.esc(s.name)}</option>`).join('');
      if (app.dom.scoreStudentSelect) {
        app.dom.scoreStudentSelect.innerHTML = sOps;
        app.dom.scoreStudentSelect.value = app.state.students.some(s => s.id === selectedScoreStudentId) ? selectedScoreStudentId : '';
      }
      if (app.dom.chartStudentSelect) {
        app.dom.chartStudentSelect.innerHTML = sOps;
        app.dom.chartStudentSelect.value = app.state.students.some(s => s.id === selectedChartStudentId) ? selectedChartStudentId : '';
      }
    },

    getStudentExamTotal: function(studentId, examId) {
      const student = app.state.students.find(s => s.id === studentId);
      const exam = app.state.exams.find(e => e.id === examId);
      if (!student || !exam) return null;
      return app.analytics.getTotal(student, exam);
    },

    renderResultsTable: function () {
      if (!app.dom.resultsHeadRow1 || !app.dom.resultsHeadRow2 || !app.dom.resultsBody) return;

      const { previousExam, latestExam } = app.analytics.getLastTwoExams();
      const canComputeImprovement = !!previousExam && !!latestExam;

      const ranked = app.state.students.map(s => ({
        ...s,
        _overallAvg: app.analytics.getStudentOverallAverage(s)
      }))
        .filter(s => s.name.toLowerCase().includes(app.state.searchTerm.toLowerCase()))
        .sort((a, b) => (b._overallAvg ?? -1) - (a._overallAvg ?? -1));
      
      const subHeaders = app.state.exams.map(() => {
        return app.state.subjects.map(sub => `<th>${app.utils.esc(sub.name.slice(0, 3))}</th>`).join('') + '<th>Total</th>';
      }).join('');
      app.dom.resultsHeadRow2.innerHTML = subHeaders;
      app.dom.resultsHeadRow1.innerHTML = `
        <th rowspan="2">Rank</th><th rowspan="2" class="sticky-col">Name</th>
        ${app.state.exams.map((m, idx) => {
          const label = m.title && m.title.toLowerCase().startsWith('mock ')
            ? 'M' + (idx + 1)
            : app.utils.esc(m.title || m.name);
          return `<th colspan="${app.state.subjects.length + 1}">${label}</th>`;
        }).join('')}
        <th rowspan="2">Avg</th><th rowspan="2">Previous</th><th rowspan="2">Improvement</th><th rowspan="2">Status</th><th rowspan="2">Notes</th><th rowspan="2">Report</th>`;

      app.dom.resultsBody.innerHTML = ranked.map((s, i) => {
        const currentTotal = latestExam ? this.getStudentExamTotal(s.id, latestExam.id) : null;
        const previousTotal = previousExam ? this.getStudentExamTotal(s.id, previousExam.id) : null;
        const improvData = canComputeImprovement
          ? this.formatImprovement(currentTotal, previousTotal)
          : { text: '', className: 'improv-neutral' };
        let examCells = app.state.exams.map(m => {
          let subCells = app.state.subjects.map(sub => {
            const score = app.analytics.getScore(s, sub, m);
            return `<td>${score === '' ? '—' : score}</td>`;
          }).join('');
          const total = this.getStudentExamTotal(s.id, m.id);
          return subCells + `<td class="avg">${total ?? '—'}</td>`;
        }).join('');
        const status = app.analytics.getStudentStatus(s, latestExam);
        const avgVal = s._overallAvg;
        const avgCls = avgVal !== null ? (avgVal >= 70 ? 'avg-green' : (avgVal >= 50 ? 'avg-yellow' : 'avg-red')) : '';
        const statusClass = `risk-${status}`;
        return `<tr>
          <td><strong class="rank-num rank-highlight">${i + 1}</strong></td><td class="sticky-col">${app.utils.esc(s.name)}</td>
          ${examCells}
          <td><strong class="${avgCls} avg-emphasis">${avgVal?.toFixed(1) ?? '&#8212;'}</strong></td>
          <td>${canComputeImprovement ? (previousTotal !== null ? previousTotal.toFixed(1) : 'N/A') : '&#8212;'}</td>
          <td class="${improvData.className}">${improvData.text}</td>
          <td><span class="risk-pill status-pill ${statusClass}">${this.formatStatusLabel(status)}</span></td>
          <td class="notes-cell" onclick="window.TrackerApp.ui.openNotes('${s.id}')">${s.notes ? '&#128221; View' : '+ Add'}</td>
          <td class="report-cell" data-report-id="${s.id}">&#128196; Report</td>
        </tr>`;
      }).join('');
    },

    renderInterventionList: function () {
      if (!app.dom.interventionItems) return;
      const studentLookup = new Map((app.state.students || []).map(student => [student.id, student]));
      const flagged = (app.analytics.groupStudentsByStatus().groups['at-risk'] || [])
        .map(item => ({ student: studentLookup.get(item.id), avg: item.average }))
        .filter(item => item.student)
        .sort((a, b) => (a.avg || 0) - (b.avg || 0));

      if (!flagged.length) {
        app.dom.interventionItems.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">No students currently need intervention.</p>';
        return;
      }

      app.dom.interventionItems.innerHTML = flagged.map(x => {
        const s = x.student;
        const avg = x.avg;
        const status = app.analytics.getStudentStatus(s);
        const statusClass = `risk-${status}`;
        const weakest = app.analytics.getWeakestSubject(s);
        return `
        <div class="intervention-card">
          <div class="intervention-header">
            <span class="intervention-name">${app.utils.esc(s.name)}</span>
            <span class="risk-pill status-pill ${statusClass}">${this.formatStatusLabel(status)}</span>
          </div>
          <div class="intervention-meta">
            <span class="intervention-avg">Avg: ${avg !== null && avg !== undefined ? avg.toFixed(1) : 'N/A'}%</span>
            <span class="intervention-weakest">Weakest: ${app.utils.esc(weakest)}</span>
          </div>
        </div>`;
      }).join('');
    },

    openPerformanceCategory: function (categoryKey) {
      const categories = app.analytics.getPerformanceCategories();
      const fallbackCategory = categories[0]?.key || 'strong';
      const selectedCategory = categories.some(category => category.key === categoryKey)
        ? categoryKey
        : fallbackCategory;

      app.state.selectedPerformanceCategory = selectedCategory;
      if (app.dom.performanceCategorySelect) {
        app.dom.performanceCategorySelect.value = selectedCategory;
      }

      if (app.sidebar && typeof app.sidebar.showSection === 'function') {
        app.sidebar.showSection('performance-analysis');
      } else {
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        const performanceSection = document.getElementById('performance-analysis');
        if (performanceSection) performanceSection.classList.add('active');
      }

      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === 'performance-analysis');
      });

      this.renderPerformanceAnalysisPanel();
    },

    renderPerformanceAnalysisPanel: function () {
      if (!app.dom.performanceCategorySelect || !app.dom.performanceCategoryCounts || !app.dom.performanceFilteredList || !app.dom.performanceInterventionNeededList) return;

      const categories = app.analytics.getPerformanceCategories();
      const fallbackCategory = categories[0]?.key || 'strong';

      if (!app.dom.performanceCategorySelect.options.length) {
        app.dom.performanceCategorySelect.innerHTML = categories
          .map(option => `<option value="${option.key}">${option.label}</option>`)
          .join('');
      }

      if (!categories.some(option => option.key === app.state.selectedPerformanceCategory)) {
        app.state.selectedPerformanceCategory = fallbackCategory;
      }
      app.dom.performanceCategorySelect.value = app.state.selectedPerformanceCategory;

      const { groups, latestExam } = app.analytics.groupStudentsByStatus();
      app.dom.performanceCategoryCounts.innerHTML = categories.map(option => {
        const count = (groups[option.key] || []).length;
        return `<div class="performance-count-chip risk-${option.key}"><span>${option.label}</span><strong>${count}</strong></div>`;
      }).join('');

      const selectedList = groups[app.state.selectedPerformanceCategory] || [];
      const selectedLabel = categories.find(option => option.key === app.state.selectedPerformanceCategory)?.label || 'Category';
      const selectedRows = selectedList.map(item => `
        <div class="performance-analysis-item">
          <div>
            <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
            <div class="performance-analysis-meta">${latestExam ? `Latest exam: ${app.utils.esc(latestExam)}` : 'No exam data yet'}</div>
          </div>
          <div class="performance-analysis-side">
            <span class="risk-pill status-pill risk-${app.state.selectedPerformanceCategory}">${selectedLabel}</span>
            <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
          </div>
        </div>
      `).join('');

      app.dom.performanceFilteredList.innerHTML = selectedRows || `<p class="performance-analysis-empty">No students in ${selectedLabel} category.</p>`;

      const interventionRows = (groups['at-risk'] || []).map(item => `
        <div class="performance-analysis-item intervention">
          <div>
            <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
            <div class="performance-analysis-meta">Immediate support recommended</div>
          </div>
          <div class="performance-analysis-side">
            <span class="risk-pill status-pill risk-at-risk">Intervention Needed</span>
            <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
          </div>
        </div>
      `).join('');
      app.dom.performanceInterventionNeededList.innerHTML = interventionRows || '<p class="performance-analysis-empty">No students currently in At Risk category.</p>';
    },

    renderClassSummary: function () {
      if (!app.dom.classChart) return; 
      const { previousExam, latestExam } = app.analytics.getLastTwoExams();
      const trendExams = [previousExam, latestExam].filter(Boolean);
      const avgs = app.analytics.calcClassAverages(trendExams);
      const hasData = avgs.some(v => v.overall !== null);
      
      // Update Chart
      if (app.charts) app.charts.renderClassChart(avgs, hasData, app);

      if (!hasData) {
        if (app.dom.classSummaryCards) app.dom.classSummaryCards.innerHTML = '<p>No data available</p>';
        return;
      }

      // Generate Summary Cards
      if (app.dom.classSummaryCards) {
        let cardsHtml = '';

        avgs.forEach((exam, idx) => {
          const isLatest = idx === avgs.length - 1;
          const isPrevious = idx === 0 && avgs.length > 1;
          let badge = '';
          if (isLatest) badge = '<span class="trend-badge badge-current">Current</span>';
          else if (isPrevious) badge = '<span class="trend-badge badge-previous">Previous</span>';

          // Check for improvement badge (if current exam improved from its predecessor)
          if (avgs.length === 2 && idx === 1 && exam.overall !== null && avgs[0].overall !== null) {
            if (exam.overall > avgs[0].overall) {
              badge = '<span class="trend-badge badge-improved">Improved</span>';
            }
          }

          cardsHtml += `
            <div class="trend-card">
              <div class="trend-card-header">
                <span class="trend-card-title">${app.utils.esc(exam.name)}</span>
                ${badge}
              </div>
              <div class="trend-card-value">${exam.overall ? exam.overall.toFixed(1) + '%' : '—'}</div>
            </div>
          `;
        });
        app.dom.classSummaryCards.innerHTML = cardsHtml;
      }

      // Generate Insight Box
      if (app.dom.classInsightBox && avgs.length >= 2) {
        const current = avgs[avgs.length - 1];
        const previous = avgs[avgs.length - 2];
        
        if (current.overall !== null && previous.overall !== null) {
          const diff = current.overall - previous.overall;
          const trendClass = diff >= 0 ? 'trend-up' : 'trend-down';
          const icon = diff >= 0 ? '↑' : '↓';
          const statusText = diff >= 0 ? 'improved overall' : 'declined slightly';
          const trendMessage = diff >= 0 
            ? 'Performance trend is upward' 
            : 'Performance trend is downward';

          app.dom.classInsightBox.innerHTML = `
            <div class="insight-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              Performance Insight
            </div>
            <div class="insight-text">
              Class performance <span class="trend-indicator ${trendClass}">${icon} ${statusText}</span> by <strong>${Math.abs(diff).toFixed(1)}%</strong> from ${app.utils.esc(previous.name)} to ${app.utils.esc(current.name)}.
              <br><span style="font-weight:600; color:var(--text); margin-top:0.35rem; display:inline-block;">${trendMessage}.</span>
            </div>
          `;
        }
      } else if (app.dom.classInsightBox) {
        app.dom.classInsightBox.innerHTML = '<div class="insight-text">Add scores for another exam to see performance trends and insights.</div>';
      }
    },

    openNotes: function (uid) {
      const s = app.state.students.find(x => x.id === uid); if (!s) return;
      app.state.notesId = uid;
      if (app.dom.notesModalTitle) app.dom.notesModalTitle.textContent = s.name;
      if (app.dom.notesTextarea) app.dom.notesTextarea.value = s.notes || '';
      if (app.dom.notesModal) app.dom.notesModal.classList.add('active');
    },

    saveNotes: function () {
      const s = app.state.students.find(x => x.id === app.state.notesId);
      if (s) { s.notes = app.dom.notesTextarea.value; app.save(); this.refreshUI(); }
      if (app.dom.notesModal) app.dom.notesModal.classList.remove('active');
    },

    openReport: function (uid) {
      const s = app.state.students.find(x => x.id === uid);
      if (!s || !app.dom.reportContainer || !app.dom.reportModal) return;

      const exams = app.state.exams || [];
      const subjects = app.state.subjects || [];
      const avgs = app.analytics.calcAverages(s);
      const avg = app.analytics.getStudentOverallAverage(s);
      const { previousExam, latestExam } = app.analytics.getLastTwoExams();
      const status = app.analytics.getStudentStatus(s, latestExam);
      const statusClass = status === 'at-risk' ? 'rc-risk' : (status === 'borderline' ? 'rc-borderline' : 'rc-safe');

      const examCount = exams.length;
      const currentScore = latestExam ? app.analytics.getTotal(s, latestExam) : null;
      const previousScore = previousExam ? app.analytics.getTotal(s, previousExam) : null;
      const improvement = this.formatImprovement(currentScore, previousScore);

      const ranked = (app.state.students || [])
        .map(student => ({ id: student.id, avg: app.analytics.getStudentOverallAverage(student) }))
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
      const rank = Math.max(1, ranked.findIndex(item => item.id === s.id) + 1);

      let strongest = 'N/A';
      let weakest = 'N/A';
      let strongestScore = -Infinity;
      let weakestScore = Infinity;
      subjects.forEach(subject => {
        const value = avgs[subject.name];
        if (value === null || value === undefined || isNaN(value)) return;
        if (value > strongestScore) {
          strongestScore = value;
          strongest = subject.name;
        }
        if (value < weakestScore) {
          weakestScore = value;
          weakest = subject.name;
        }
      });

      const examHeaders = exams.length
        ? exams.map(exam => `<th>${app.utils.esc(exam.title || exam.name)}</th>`).join('')
        : '<th>No Exams</th>';

      const subjectRows = subjects.length
        ? subjects.map(subject => {
          const examCells = exams.length
            ? exams.map(exam => {
              const score = app.analytics.getScore(s, subject, exam);
              return `<td>${score === '' ? '&#8212;' : app.utils.esc(score)}</td>`;
            }).join('')
            : '<td>&#8212;</td>';
          const subjectAverage = avgs[subject.name];
          return `<tr>
            <td class="rc-subject">${app.utils.esc(subject.name)}</td>
            ${examCells}
            <td>${subjectAverage !== null && subjectAverage !== undefined ? Number(subjectAverage).toFixed(1) : '&#8212;'}</td>
          </tr>`;
        }).join('')
        : `<tr><td colspan="${Math.max(3, exams.length + 2)}">No subjects added yet.</td></tr>`;

      const reportMarkup = `
        <div class="report-card">
          <div class="rc-header">
            <div class="rc-school">Student Performance Report</div>
            <div class="rc-location">Generated: ${new Date().toLocaleString()}</div>
            <div class="rc-title">${app.utils.esc(s.name)}</div>
          </div>

          <div class="rc-info">
            <div><span>Student</span><strong>${app.utils.esc(s.name)}</strong></div>
            <div><span>Rank</span><strong>${rank}/${app.state.students.length || 1}</strong></div>
            <div><span>Status</span><strong class="${statusClass}">${this.formatStatusLabel(status)}</strong></div>
            <div><span>Overall Average</span><strong>${avg !== null && avg !== undefined ? Number(avg).toFixed(1) + '%' : 'N/A'}</strong></div>
          </div>

          <div class="rc-summary">
            <div class="rc-summary-item"><span>Latest Total</span><strong>${currentScore !== null && currentScore !== undefined ? Number(currentScore).toFixed(1) : 'N/A'}</strong></div>
            <div class="rc-summary-item"><span>Previous Total</span><strong>${previousScore !== null && previousScore !== undefined ? Number(previousScore).toFixed(1) : 'N/A'}</strong></div>
            <div class="rc-summary-item"><span>Improvement</span><strong>${app.utils.esc(improvement.text || 'N/A')}</strong></div>
            <div class="rc-summary-item"><span>Exams Taken</span><strong>${examCount}</strong></div>
          </div>

          <div class="rc-section">
            <h4>Subject Performance</h4>
            <table class="rc-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  ${examHeaders}
                  <th>Avg</th>
                </tr>
              </thead>
              <tbody>
                ${subjectRows}
              </tbody>
            </table>
          </div>

          <div class="rc-analysis">
            <div><span>Strongest Subject</span><strong>${app.utils.esc(strongest)}</strong></div>
            <div><span>Weakest Subject</span><strong>${app.utils.esc(weakest)}</strong></div>
            <div><span>Performance Level</span><strong class="${statusClass}">${this.formatStatusLabel(status)}</strong></div>
          </div>

          <div class="rc-section">
            <h4>Teacher Notes</h4>
            <div class="rc-notes">${s.notes ? app.utils.esc(s.notes) : 'No notes added yet.'}</div>
          </div>

          <div class="rc-footer">
            <div class="rc-sig"><div class="rc-sig-line"></div><span>Class Teacher</span></div>
            <div class="rc-sig"><div class="rc-sig-line"></div><span>Head Teacher</span></div>
          </div>
        </div>
      `;

      app.dom.reportContainer.innerHTML = reportMarkup;
      app.dom.reportModal.classList.add('active');
    },

    printReportOnly: function () {
      if (!app.dom.reportContainer || !app.dom.reportModal) return;
      const hasReportContent = app.dom.reportContainer.innerHTML.trim().length > 0;
      if (!hasReportContent) {
        this.showToast('Open a student report first');
        return;
      }

      const wasOpen = app.dom.reportModal.classList.contains('active');
      if (!wasOpen) {
        app.dom.reportModal.classList.add('active');
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove('printing-report');
        window.removeEventListener('afterprint', cleanup);
        if (!wasOpen && app.dom.reportModal) {
          app.dom.reportModal.classList.remove('active');
        }
      };

      document.body.classList.add('printing-report');
      window.addEventListener('afterprint', cleanup);
      window.print();
      setTimeout(cleanup, 1200);
    },

    loadScoreFields: function () {
      const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
      const s = app.state.students.find(x => x.id === sid);
      const exam = app.state.exams.find(x => x.id === mid);
      if (s) {
        app.dom.dynamicSubjectFields.innerHTML = app.state.subjects.map(sb => {
          const value = exam ? app.analytics.getScore(s, sb, exam) : '';
          return `<div class="form-group"><label>${app.utils.esc(sb.name)}</label><input type="number" data-subject="${sb.name}" value="${value}"></div>`;
        }).join('');
      } else {
        app.dom.dynamicSubjectFields.innerHTML = '';
      }
    },

    renderBulkTable: function () {
      if (!app.dom.bulkScoreHead || !app.dom.bulkScoreBody) return;
      
      const headHtml = '<th>Student</th>' + app.state.subjects.map(s => `<th>${app.utils.esc(s.name)}</th>`).join('');
      app.dom.bulkScoreHead.innerHTML = `<tr>${headHtml}</tr>`;
      
      const examId = app.dom.bulkMockSelect?.value || app.state.selectedBulkExamId || '';
      app.state.selectedBulkExamId = examId;
      const exam = app.state.exams.find(e => e.id === examId);
      const bodyHtml = app.state.students.map(s => {
        const row = app.state.subjects.map(sub => {
          const val = exam ? app.analytics.getScore(s, sub, exam) : '';
          return `<td><input type="number" class="bulk-score-input" data-sid="${s.id}" data-sub="${sub.name}" value="${val === '' ? '' : val}" min="0" max="100"></td>`;
        }).join('');
        const studentName = app.utils.esc(s.name);
        return `<tr><td class="sticky-col"><div class="bulk-student-cell"><span class="bulk-student-name">${studentName}</span><button type="button" class="bulk-row-reset-btn" data-reset-student-id="${s.id}" title="Clear all marks for ${studentName}" aria-label="Clear all marks for ${studentName}">&#8635;</button></div></td>${row}</tr>`;
      }).join('');
      
      app.dom.bulkScoreBody.innerHTML = bodyHtml;
    },

    refreshUI: function () {
      console.log("Refreshing UI...");
      try {
        if (app.dom.emptyMsg) app.dom.emptyMsg.style.display = app.state.students.length ? 'none' : 'block';
        this.renderManagement();
        this.populateSelects();
        this.loadScoreFields();
        this.updateDashboardStats();
        this.renderPerformanceAnalysisPanel();
        this.renderClassSummary();
        this.renderStudentChips();
        this.renderResultsTable();
        this.renderBulkTable();
        this.updateBackupStatus();
        
        // Render heatmap
        app.heatmap.renderHeatmap(app);
      } catch (e) {
        console.error("RefreshUI Error:", e);
      }
    },

    renderAll: function () { this.refreshUI(); },

    renderManagement: function () {
      if (!app.dom.mockList || !app.dom.subjectList) return;
      app.dom.mockList.innerHTML = app.state.exams.map(m => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(m.title || m.name)}" onchange="window.TrackerApp.ui.renameExam('${m.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteExam('${m.id}')">×</button>
        </div>`).join('');
      app.dom.subjectList.innerHTML = app.state.subjects.map(s => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(s.name)}" onchange="window.TrackerApp.ui.renameSubject('${s.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteSubject('${s.id}')">×</button>
        </div>`).join('');
    },

    renameExam: async function (id, name) { 
      try {
        await app.updateExam(id, { title: name.trim() });
        this.refreshUI(); 
      } catch (error) {
        console.error('Failed to rename exam:', error);
        app.ui.showToast('Failed to rename exam');
      }
    },
    deleteExam: async function (id) { 
      if (confirm("Delete exam?")) { 
        try {
          await app.deleteExam(id);
          this.refreshUI(); 
        } catch (error) {
          console.error('Failed to delete exam:', error);
          app.ui.showToast('Failed to delete exam');
        }
      } 
    },
    renameSubject: async function (id, n) {
      try {
        await app.updateSubject(id, { name: n.trim() });
        this.refreshUI();
      } catch (error) {
        console.error('Failed to rename subject:', error);
        app.ui.showToast('Failed to rename subject');
      }
    },
    deleteSubject: async function (id) {
      if (confirm("Delete subject?")) {
        try {
          await app.deleteSubject(id);
          this.refreshUI();
        } catch (error) {
          console.error('Failed to delete subject:', error);
          app.ui.showToast('Failed to delete subject');
        }
      }
    },

    bindEvents: function () {
      console.log('Binding events...');
      try {
        const tabs = document.querySelectorAll('.tab, .sidebar-item');
        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            console.log('Tab clicked:', tab);

            const target = tab.dataset.section;
            if (!target) return;

            document.querySelectorAll('.section, .content-section').forEach(section => {
              section.style.display = 'none';
              section.classList.remove('active');
            });

            const activeSection = document.getElementById(target);
            if (activeSection) {
              activeSection.style.display = 'block';
              activeSection.classList.add('active');
            }

            tabs.forEach(tabItem => tabItem.classList.remove('active'));
            tab.classList.add('active');
          });
        });

        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('Button clicked:', btn);
          });
        });

        // Initialize sidebar
        if (app.sidebar && app.sidebar.init) {
          app.sidebar.init();
        }
        
        if (app.dom.form) app.dom.form.onsubmit = (e) => { e.preventDefault(); app.students.addStudent(app.dom.nameInput.value, app, this); app.dom.nameInput.value = ''; };
        if (app.dom.createSnapshotBtn) app.dom.createSnapshotBtn.onclick = () => this.createSnapshot('Manual Restore Point');
        if (app.dom.snapshotManagerBtn) app.dom.snapshotManagerBtn.onclick = () => this.openSnapshotModal();
        if (app.dom.backupBtn) app.dom.backupBtn.onclick = () => app.export.exportBackup(app);
        if (app.dom.restoreBtn) app.dom.restoreBtn.onclick = () => app.dom.restoreInput.click();
        if (app.dom.restoreInput) app.dom.restoreInput.onchange = (e) => app.export.importBackup(e.target.files[0], app);
        if (app.dom.snapshotCloseBtn) app.dom.snapshotCloseBtn.onclick = () => this.closeSnapshotModal();
        if (app.dom.themeToggle) app.dom.themeToggle.onclick = () => { app.state.theme = app.state.theme === 'light' ? 'dark' : 'light'; app.applyTheme(); };
        if (app.dom.resetBtn) app.dom.resetBtn.onclick = () => app.dom.resetModal.classList.add('active');
        if (app.dom.resetConfirmBtn) app.dom.resetConfirmBtn.onclick = async () => {
          await this.clearAllData();
          app.dom.resetModal.classList.remove('active');
        };
        if (app.dom.resetCancelBtn) app.dom.resetCancelBtn.onclick = () => app.dom.resetModal.classList.remove('active');
        if (app.dom.bulkImportBtn) app.dom.bulkImportBtn.onclick = () => app.dom.bulkImportModal.classList.add('active');
        if (app.dom.bulkImportConfirmBtn) app.dom.bulkImportConfirmBtn.onclick = () => { app.students.bulkImport(app.dom.bulkImportTextarea.value, app, this); app.dom.bulkImportModal.classList.remove('active'); };
        if (app.dom.bulkImportCancelBtn) app.dom.bulkImportCancelBtn.onclick = () => app.dom.bulkImportModal.classList.remove('active');
        if (app.dom.editSaveBtn) app.dom.editSaveBtn.onclick = () => app.students.saveEdit(app, this);
        if (app.dom.editCancelBtn) app.dom.editCancelBtn.onclick = () => app.dom.editModal.classList.remove('active');
        if (app.dom.deleteConfirmBtn) app.dom.deleteConfirmBtn.onclick = () => app.students.confirmDelete(app, this);
        if (app.dom.deleteCancelBtn) app.dom.deleteCancelBtn.onclick = () => app.dom.deleteModal.classList.remove('active');
        if (app.dom.notesSaveBtn) app.dom.notesSaveBtn.onclick = () => this.saveNotes();
        if (app.dom.notesCancelBtn) app.dom.notesCancelBtn.onclick = () => app.dom.notesModal.classList.remove('active');
        if (app.dom.bulkScoreBtn) app.dom.bulkScoreBtn.onclick = () => { app.dom.bulkScoreModal.classList.add('active'); this.renderBulkTable(); };
        if (app.dom.bulkScoreCancelBtn) app.dom.bulkScoreCancelBtn.onclick = () => app.dom.bulkScoreModal.classList.remove('active');
        if (app.dom.bulkScoreSaveBtn) app.dom.bulkScoreSaveBtn.onclick = () => app.students.saveBulkScores(app.dom.bulkMockSelect.value, app.dom.bulkScoreBody.querySelectorAll('.bulk-score-input'), app, this);
        if (app.dom.addMockForm) app.dom.addMockForm.onsubmit = async (e) => { 
          e.preventDefault(); 
          if (app.dom.mockNameInput.value.trim()) { 
            try {
              await app.addExam({ title: app.dom.mockNameInput.value.trim(), date: new Date().toISOString() });
              this.refreshUI(); 
              app.ui.showToast('Exam added');
            } catch (error) {
              console.error('Failed to add exam:', error);
              app.ui.showToast('Failed to add exam');
            }
          } 
          app.dom.mockNameInput.value = ''; 
        };
        if (app.dom.addSubjectForm) app.dom.addSubjectForm.onsubmit = async (e) => { 
          e.preventDefault(); 
          if (app.dom.subjectNameInput.value.trim()) { 
            try {
              await app.addSubject({ name: app.dom.subjectNameInput.value.trim() });
              this.refreshUI(); 
            } catch (error) {
              console.error('Failed to add subject:', error);
              app.ui.showToast('Failed to add subject');
            }
          } 
          app.dom.subjectNameInput.value = ''; 
        };
        if (app.dom.saveScoresBtn) app.dom.saveScoresBtn.onclick = () => {
          const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
          const scores = {};
          app.dom.dynamicSubjectFields.querySelectorAll('input').forEach(f => {
            const subjectName = f.dataset.subject;
            if (subjectName) {
              scores[subjectName] = app.normalizeScore(f.value);
            }
          });
          app.students.saveScores(sid, mid, scores, app, this);
        };
        if (app.dom.scoreStudentSelect) app.dom.scoreStudentSelect.onchange = () => this.loadScoreFields();
        if (app.dom.scoreMockSelect) app.dom.scoreMockSelect.onchange = () => { this.loadScoreFields(); this.refreshUI(); };
        if (app.dom.bulkMockSelect) app.dom.bulkMockSelect.onchange = () => {
          app.state.selectedBulkExamId = app.dom.bulkMockSelect.value || '';
          this.renderBulkTable();
        };
        if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.onchange = () => app.charts.renderStudentChart(app.dom.chartStudentSelect.value, app);
        if (app.dom.searchInput) app.dom.searchInput.oninput = (e) => { app.state.searchTerm = e.target.value; this.renderResultsTable(); };
        if (app.dom.reportCloseBtn) app.dom.reportCloseBtn.onclick = () => app.dom.reportModal.classList.remove('active');
        if (app.dom.reportPrintBtn) app.dom.reportPrintBtn.onclick = () => this.printReportOnly();
        if (app.dom.exportCsvBtn) app.dom.exportCsvBtn.onclick = () => app.export.exportCSV(app);
        if (app.dom.exportExcelBtn) app.dom.exportExcelBtn.onclick = () => app.export.exportExcel(app);
        if (app.dom.printBtn) app.dom.printBtn.onclick = () => this.printReportOnly();
        if (app.dom.resultsBody) app.dom.resultsBody.addEventListener('click', (e) => {
          const reportCell = e.target.closest('.report-cell');
          if (reportCell && reportCell.dataset.reportId) {
            console.log('Report clicked for', reportCell.dataset.reportId);
            this.openReport(reportCell.dataset.reportId);
          }
        });

        if (app.dom.performanceCategorySelect) {
          app.dom.performanceCategorySelect.onchange = (e) => {
            const fallbackCategory = app.analytics.getPerformanceCategories()[0]?.key || 'strong';
            app.state.selectedPerformanceCategory = e.target.value || fallbackCategory;
            this.renderPerformanceAnalysisPanel();
          };
        }

        if (app.dom.dashboardPerformanceSummary) {
          app.dom.dashboardPerformanceSummary.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-performance-category]');
            if (!trigger) return;
            this.openPerformanceCategory(trigger.dataset.performanceCategory);
          });
        }

        if (app.dom.snapshotModal) {
          app.dom.snapshotModal.addEventListener('click', (e) => {
            if (e.target === app.dom.snapshotModal) {
              this.closeSnapshotModal();
            }
          });
        }

        if (app.dom.snapshotList) {
          app.dom.snapshotList.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-snapshot-action]');
            if (!trigger) return;

            const action = trigger.dataset.snapshotAction;
            const snapshotId = trigger.dataset.snapshotId;
            if (!snapshotId || !app.snapshots) return;

            if (action === 'restore' && typeof app.snapshots.restoreSnapshot === 'function') {
              app.snapshots.restoreSnapshot(snapshotId);
              return;
            }

            if (action === 'delete' && typeof app.snapshots.deleteSnapshot === 'function') {
              if (!confirm('Delete this restore point?')) return;
              app.snapshots.deleteSnapshot(snapshotId);
              this.renderSnapshotList();
            }
          });
        }

        if (app.dom.dynamicSubjectFields) {
          app.dom.dynamicSubjectFields.addEventListener('input', (e) => {
            if (e.target && e.target.matches('input[type="number"]')) {
              e.target.value = app.normalizeScore(e.target.value);
            }
          });
        }

        if (app.dom.bulkScoreBody) {
          app.dom.bulkScoreBody.addEventListener('click', (e) => {
            const resetBtn = e.target.closest('.bulk-row-reset-btn');
            if (!resetBtn) return;

            const row = resetBtn.closest('tr');
            if (!row) return;

            if (!confirm('Clear all marks for this student?')) return;

            row.querySelectorAll('.bulk-score-input').forEach(input => {
              input.value = '';
            });

            this.showToast('Student marks cleared');
          });

          app.dom.bulkScoreBody.addEventListener('input', (e) => {
            if (e.target && e.target.matches('input[type="number"]')) {
              e.target.value = app.normalizeScore(e.target.value);
            }
          });
        }

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });
        console.log("Events Bound Successfully.");
      } catch (e) {
        console.error("BindEvents Error:", e);
      }
    }
  };

// Export UI module and assign to global app
app.ui = ui;
export default ui;
