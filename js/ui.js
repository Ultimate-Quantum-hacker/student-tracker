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
  classSummaryBody: 'class-summary-body',
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
  statSafeCount: 'stat-safe-count',
  statBorderlineCount: 'stat-borderline-count',
  statAtRiskCount: 'stat-at-risk-count',
  statAtRiskCountSecondary: 'stat-at-risk-count-2',
  interventionItems: 'intervention-items',
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
  bulkScoreHead: 'bulkScoreHead'
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
        return { text: '—', className: 'improv-neutral' };
      }
      const diff = Number(current) - Number(previous);
      if (isNaN(diff)) return { text: '—', className: 'improv-neutral' };
      if (diff > 0) return { text: '+' + diff.toFixed(1), className: 'improv-up' };
      if (diff < 0) return { text: diff.toFixed(1), className: 'improv-down' };
      return { text: '0', className: 'improv-neutral' };
    },

    formatRiskLabel: function (riskType) {
      if (riskType === 'at-risk') return 'At Risk';
      if (riskType === 'borderline') return 'Borderline';
      return 'Safe';
    },

    clearAllData: async function () {
      app.applyRawData({ students: [], subjects: [], exams: [] });
      await app.save();
      this.refreshUI();
      this.showToast('All data cleared');
    },

    openRiskPage: function (type) {
      window.open(`risk.html?type=${type}`, '_blank');
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
      
      let sum = 0, count = 0, pass = 0, atRisk = 0, borderline = 0, safe = 0;
      app.state.students.forEach(s => {
        const avg = app.analytics.calcAverages(s, app.state.subjects, app.state.exams).overall;
        if (avg !== null) { sum += avg; count++; if (avg >= 50) pass++; }
        const status = app.analytics.getRiskLevel(s);
        if (status === 'at-risk') atRisk++;
        else if (status === 'borderline') borderline++;
        else safe++;
      });
      
      if (app.dom.statClassAvg) app.dom.statClassAvg.textContent = count ? (sum / count).toFixed(1) : '0.0';
      if (app.dom.statPassRate) app.dom.statPassRate.textContent = count ? Math.round((pass / count) * 100) + '%' : '0%';
      if (app.dom.statFailRate) app.dom.statFailRate.textContent = count ? Math.round(((count - pass) / count) * 100) + '%' : '0%';
      if (app.dom.statSafeCount) app.dom.statSafeCount.textContent = safe;
      if (app.dom.statBorderlineCount) app.dom.statBorderlineCount.textContent = borderline;
      if (app.dom.statAtRiskCount) app.dom.statAtRiskCount.textContent = atRisk;
      if (app.dom.statAtRiskCountSecondary) app.dom.statAtRiskCountSecondary.textContent = atRisk;
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
      const mOps = app.state.exams.map(m => `<option value="${m.id}">${app.utils.esc(m.title || m.name)}</option>`).join('');
      if (app.dom.scoreMockSelect) app.dom.scoreMockSelect.innerHTML = mOps;
      if (app.dom.bulkMockSelect) app.dom.bulkMockSelect.innerHTML = mOps;
      
      const sOps = '<option value="">— Select Student —</option>' + app.state.students.map(s => `<option value="${s.id}">${app.utils.esc(s.name)}</option>`).join('');
      if (app.dom.scoreStudentSelect) app.dom.scoreStudentSelect.innerHTML = sOps;
      if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.innerHTML = sOps;
    },

    getStudentExamTotal: function(studentId, examId) {
      const student = app.state.students.find(s => s.id === studentId);
      const exam = app.state.exams.find(e => e.id === examId);
      if (!student || !exam) return null;
      return app.analytics.getTotal(student, exam);
    },

    renderResultsTable: function () {
      if (!app.dom.resultsHeadRow1 || !app.dom.resultsHeadRow2 || !app.dom.resultsBody) return;

      const ranked = app.state.students.map(s => ({ ...s, _avg: app.analytics.calcAverages(s, app.state.subjects, app.state.exams) }))
        .filter(s => s.name.toLowerCase().includes(app.state.searchTerm.toLowerCase()))
        .sort((a, b) => (b._avg.overall || 0) - (a._avg.overall || 0));
      
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
        const examCount = app.state.exams.length;
        const currentExam = app.state.exams[examCount - 1];
        const previousExam = app.state.exams[examCount - 2];
        const currentTotal = currentExam ? this.getStudentExamTotal(s.id, currentExam.id) : null;
        const previousTotal = previousExam ? this.getStudentExamTotal(s.id, previousExam.id) : null;
        const improvData = this.formatImprovement(currentTotal, previousTotal);
        let examCells = app.state.exams.map(m => {
          let subCells = app.state.subjects.map(sub => {
            const score = app.analytics.getScore(s, sub, m);
            return `<td>${score === '' ? '—' : score}</td>`;
          }).join('');
          const total = this.getStudentExamTotal(s.id, m.id);
          return subCells + `<td class="avg">${total ?? '—'}</td>`;
        }).join('');
        const status = app.analytics.getRiskLevel(s);
        const avgVal = s._avg.overall;
        const avgCls = avgVal !== null ? (avgVal >= 70 ? 'avg-green' : (avgVal >= 50 ? 'avg-yellow' : 'avg-red')) : '';
        const statusClass = `risk-${status}`;
        return `<tr>
          <td><strong class="rank-num rank-highlight">${i + 1}</strong></td><td class="sticky-col">${app.utils.esc(s.name)}</td>
          ${examCells}
          <td><strong class="${avgCls} avg-emphasis">${avgVal?.toFixed(1) ?? '&#8212;'}</strong></td>
          <td>${previousTotal !== null ? previousTotal.toFixed(1) : '&#8212;'}</td>
          <td class="${improvData.className}">${improvData.text}</td>
          <td><span class="risk-pill status-pill ${statusClass}">${this.formatRiskLabel(status)}</span></td>
          <td class="notes-cell" onclick="window.TrackerApp.ui.openNotes('${s.id}')">${s.notes ? '&#128221; View' : '+ Add'}</td>
          <td class="report-cell" data-report-id="${s.id}">&#128196; Report</td>
        </tr>`;
      }).join('');
    },

    renderInterventionList: function () {
      if (!app.dom.interventionItems) return;
      // Only show students with overall average ≤ 50 for intervention
      const flagged = app.state.students
        .map(s => {
          const avgs = app.analytics.calcAverages(s);
          return { student: s, avg: avgs.overall };
        })
        .filter(x => x.avg !== null && x.avg <= 50)
        .sort((a, b) => (a.avg || 0) - (b.avg || 0));

      if (!flagged.length) {
        app.dom.interventionItems.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">All students are on track.</p>';
        return;
      }

      app.dom.interventionItems.innerHTML = flagged.map(x => {
        const s = x.student;
        const avg = x.avg;
        const status = app.analytics.getRiskLevel(s);
        const statusClass = `risk-${status}`;
        const weakest = app.analytics.getWeakestSubject(s);
        return `
        <div class="intervention-card">
          <div class="intervention-header">
            <span class="intervention-name">${app.utils.esc(s.name)}</span>
            <span class="risk-pill status-pill ${statusClass}">${this.formatRiskLabel(status)}</span>
          </div>
          <div class="intervention-meta">
            <span class="intervention-avg">Avg: ${avg.toFixed(1)}%</span>
            <span class="intervention-weakest">Weakest: ${app.utils.esc(weakest)}</span>
          </div>
        </div>`;
      }).join('');
    },

    renderClassSummary: function () {
      if (!app.dom.classSummaryBody) return;
      const avgs = app.analytics.calcClassAverages();
      app.dom.classSummaryBody.innerHTML = avgs.map(m => `
        <tr><td>${app.utils.esc(m.name)}</td><td>${m.overall?.toFixed(1) || '—'}</td></tr>
      `).join('');
      if (app.charts) app.charts.renderClassChart(avgs, avgs.some(v => v.overall !== null));
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
      const s = app.state.students.find(x => x.id === uid); if (!s) return;
      const avgs = app.analytics.calcAverages(s);
      const avg = avgs.overall ?? 0;
      const risk = app.analytics.getRiskLevel(s);
      const mockCount = app.state.exams.length;
      const currentMock = app.state.exams[mockCount - 1];
      const previousMock = app.state.exams[mockCount - 2];
      const currentScore = currentMock ? app.analytics.getTotal(s, currentMock) : null;
      const previousScore = previousMock ? app.analytics.getTotal(s, previousMock) : null;
      const improvement = this.formatImprovement(currentScore, previousScore);
      const ranked = app.state.students.map(st => ({ id: st.id, avg: app.analytics.calcAverages(st).overall || 0 })).sort((a, b) => b.avg - a.avg);
      const rank = ranked.findIndex(r => r.id === s.id) + 1;
      let strongest = null, weakest = null, maxS = -1, minS = Infinity;
      app.state.subjects.forEach(sub => { if (avgs[sub.id] !== null && avgs[sub.id] !== undefined) { if (avgs[sub.id] > maxS) { maxS = avgs[sub.id]; strongest = sub.name; } if (avgs[sub.id] < minS) { minS = avgs[sub.id]; weakest = sub.name; } } });
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const riskClass = risk === 'at-risk' ? 'rc-risk' : (risk === 'borderline' ? 'rc-borderline' : 'rc-safe');
      const avgClass = avg >= 70 ? 'rc-safe' : (avg >= 50 ? 'rc-borderline' : 'rc-risk');
      let scoresHtml = '<table class="rc-table"><thead><tr><th>Subject</th>' + app.state.exams.map(m => `<th>${app.utils.esc(m.title || m.name)}</th>`).join('') + '<th>Average</th></tr></thead><tbody>';
      app.state.subjects.forEach(sub => { scoresHtml += '<tr><td class="rc-subject">' + app.utils.esc(sub.name) + '</td>'; app.state.exams.forEach(m => { const val = app.analytics.getScore(s, sub, m); const cls = val !== '' && val !== null && val !== undefined ? (val >= 70 ? 'rc-safe' : (val >= 50 ? 'rc-borderline' : 'rc-risk')) : ''; scoresHtml += `<td class="${cls}">${val === '' ? '\u2014' : val}</td>`; }); const subAvg = avgs[sub.name]; scoresHtml += `<td><strong>${subAvg !== null && subAvg !== undefined ? subAvg.toFixed(1) : '\u2014'}</strong></td></tr>`; });
      scoresHtml += '</tbody></table>';
      const trendText = improvement.className === 'improv-up' ? 'Improving ▲' : (improvement.className === 'improv-down' ? 'Declining ▼' : (improvement.text !== '—' ? 'Stable' : 'Insufficient data'));
      const trendClass = improvement.className === 'improv-up' ? 'rc-safe' : (improvement.className === 'improv-down' ? 'rc-risk' : '');
      if (app.dom.reportContainer) {
        app.dom.reportContainer.innerHTML = `<div class="report-card"><div class="rc-header"><div class="rc-school">Vickmore International School</div><div class="rc-location">Krispol City, Asamoah Town</div><div class="rc-title">Academic Performance Report</div></div><div class="rc-info"><div><span>Student:</span> <strong>${app.utils.esc(s.name)}</strong></div><div><span>Class:</span> <strong>JHS 3</strong></div><div><span>Term:</span> <strong>Mock Examination</strong></div><div><span>Date:</span> <strong>${today}</strong></div></div><div class="rc-section"><h4>Subject Performance</h4>${scoresHtml}</div><div class="rc-summary"><div class="rc-summary-item"><span>Overall Average</span><strong class="${avgClass}">${avg.toFixed(1)}%</strong></div><div class="rc-summary-item"><span>Class Rank</span><strong>${rank} / ${app.state.students.length}</strong></div><div class="rc-summary-item"><span>Status</span><strong class="${riskClass}">${this.formatRiskLabel(risk)}</strong></div><div class="rc-summary-item"><span>Previous Score</span><strong>${previousScore !== null ? previousScore.toFixed(1) + '%' : '—'}</strong></div><div class="rc-summary-item"><span>Improvement</span><strong class="${improvement.className}">${improvement.text}</strong></div></div><div class="rc-section"><h4>Performance Analysis</h4><div class="rc-analysis"><div><span>Strongest Subject:</span> <strong>${strongest || '\u2014'}</strong></div><div><span>Weakest Subject:</span> <strong>${weakest || '\u2014'}</strong></div><div><span>Performance Trend:</span> <strong class="${trendClass}">${trendText}</strong></div></div></div><div class="rc-section"><h4>Teacher Comments</h4><div class="rc-notes">${s.notes ? app.utils.esc(s.notes) : 'No comments recorded.'}</div></div><div class="rc-footer"><div class="rc-sig"><div class="rc-sig-line"></div><span>Class Teacher</span></div><div class="rc-sig"><div class="rc-sig-line"></div><span>Head Teacher</span></div></div></div>`;
      }
      if (app.dom.reportModal) app.dom.reportModal.classList.add('active');
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
      
      const examId = app.dom.bulkMockSelect.value;
      const exam = app.state.exams.find(e => e.id === examId);
      const bodyHtml = app.state.students.map(s => {
        const row = app.state.subjects.map(sub => {
          const val = exam ? app.analytics.getScore(s, sub, exam) : '';
          return `<td><input type="number" class="bulk-score-input" data-sid="${s.id}" data-sub="${sub.name}" value="${val}" min="0" max="100"></td>`;
        }).join('');
        return `<tr><td class="sticky-col">${app.utils.esc(s.name)}</td>${row}</tr>`;
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
        this.renderInterventionList();
        this.renderClassSummary();
        this.renderStudentChips();
        this.renderResultsTable();
        this.renderBulkTable();
        this.updateBackupStatus();
        
        // Render charts and heatmap
        const classAverages = app.analytics.calcClassAverages(app.state.students, app.state.subjects, app.state.exams);
        const hasData = classAverages.some(a => a.overall !== null);
        app.charts.renderClassChart(classAverages, hasData, app);
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
        if (app.dom.backupBtn) app.dom.backupBtn.onclick = () => app.export.exportBackup(app);
        if (app.dom.restoreBtn) app.dom.restoreBtn.onclick = () => app.dom.restoreInput.click();
        if (app.dom.restoreInput) app.dom.restoreInput.onchange = (e) => app.export.importBackup(e.target.files[0], app);
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
        if (app.dom.bulkMockSelect) app.dom.bulkMockSelect.onchange = () => { this.renderBulkTable(); this.refreshUI(); };
        if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.onchange = () => app.charts.renderStudentChart(app.dom.chartStudentSelect.value, app);
        if (app.dom.searchInput) app.dom.searchInput.oninput = (e) => { app.state.searchTerm = e.target.value; this.renderResultsTable(); };
        if (app.dom.reportCloseBtn) app.dom.reportCloseBtn.onclick = () => app.dom.reportModal.classList.remove('active');
        if (app.dom.reportPrintBtn) app.dom.reportPrintBtn.onclick = () => window.print();
        if (app.dom.exportCsvBtn) app.dom.exportCsvBtn.onclick = () => app.export.exportCSV(app);
        if (app.dom.exportExcelBtn) app.dom.exportExcelBtn.onclick = () => app.export.exportExcel(app);
        if (app.dom.printBtn) app.dom.printBtn.onclick = () => window.print();
        if (app.dom.resultsBody) app.dom.resultsBody.addEventListener('click', (e) => {
          const reportCell = e.target.closest('.report-cell');
          if (reportCell && reportCell.dataset.reportId) {
            console.log('Report clicked for', reportCell.dataset.reportId);
            this.openReport(reportCell.dataset.reportId);
          }
        });

        const riskMap = ['safe', 'borderline', 'at-risk'];
        document.querySelectorAll('.risk-summary .risk-item').forEach((item, index) => {
          item.style.cursor = 'pointer';
          item.onclick = () => this.openRiskPage(riskMap[index] || 'safe');
        });

        if (app.dom.dynamicSubjectFields) {
          app.dom.dynamicSubjectFields.addEventListener('input', (e) => {
            if (e.target && e.target.matches('input[type="number"]')) {
              e.target.value = app.normalizeScore(e.target.value);
            }
          });
        }

        if (app.dom.bulkScoreBody) {
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
