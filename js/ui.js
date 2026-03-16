/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — ui.js
   Handles all DOM manipulation and UI logic.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

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

  app.ui = {
    
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
        const avg = app.analytics.calcAverages(s).overall;
        if (avg !== null) { sum += avg; count++; if (avg >= 50) pass++; }
        const risk = app.analytics.getRiskLevel(s);
        if (risk.includes('Risk')) atRisk++; else if (risk === 'Borderline') borderline++; else safe++;
      });
      
      if (app.dom.statClassAvg) app.dom.statClassAvg.textContent = count ? (sum / count).toFixed(1) : '0.0';
      if (app.dom.statPassRate) app.dom.statPassRate.textContent = count ? Math.round((pass / count) * 100) + '%' : '0%';
      if (app.dom.statFailRate) app.dom.statFailRate.textContent = count ? Math.round(((count - pass) / count) * 100) + '%' : '0%';
      if (app.dom.statSafeCount) app.dom.statSafeCount.textContent = safe;
      if (app.dom.statBorderlineCount) app.dom.statBorderlineCount.textContent = borderline;
      if (app.dom.statAtRiskCount) app.dom.statAtRiskCount.textContent = atRisk;
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
      const mOps = app.state.mocks.map(m => `<option value="${m.id}">${app.utils.esc(m.name)}</option>`).join('');
      if (app.dom.scoreMockSelect) app.dom.scoreMockSelect.innerHTML = mOps;
      if (app.dom.bulkMockSelect) app.dom.bulkMockSelect.innerHTML = mOps;
      
      const sOps = '<option value="">— Select Student —</option>' + app.state.students.map(s => `<option value="${s.id}">${app.utils.esc(s.name)}</option>`).join('');
      if (app.dom.scoreStudentSelect) app.dom.scoreStudentSelect.innerHTML = sOps;
      if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.innerHTML = sOps;
    },

    renderResultsTable: function () {
      if (!app.dom.resultsHeadRow1 || !app.dom.resultsHeadRow2 || !app.dom.resultsBody) return;

      const ranked = app.state.students.map(s => ({ ...s, _avg: app.analytics.calcAverages(s) }))
        .filter(s => s.name.toLowerCase().includes(app.state.searchTerm.toLowerCase()))
        .sort((a, b) => (b._avg.overall || 0) - (a._avg.overall || 0));
      
      app.dom.resultsHeadRow2.innerHTML = app.state.mocks.map(m => app.state.subjects.map(s => `<th>${s.name.slice(0, 3)}</th>`).join('') + '<th>Total</th>').join('');
      app.dom.resultsHeadRow1.innerHTML = `
        <th rowspan="2">Rank</th><th rowspan="2" class="sticky-col">Name</th>
        ${app.state.mocks.map(m => `<th colspan="${app.state.subjects.length + 1}">${app.utils.esc(m.name)}</th>`).join('')}
        <th rowspan="2">Avg</th><th rowspan="2">Improv %</th><th rowspan="2">Risk</th><th rowspan="2">Notes</th><th rowspan="2">Report</th>`;

      app.dom.resultsBody.innerHTML = ranked.map((s, i) => {
        let mockCells = app.state.mocks.map(m => {
          const sc = s.scores[m.id] || {};
          const total = app.analytics.mockTotal(sc);
          let subCells = app.state.subjects.map(sb => `<td>${sc[sb.id] ?? '—'}</td>`).join('');
          return `${subCells}<td><strong>${total ?? '—'}</strong></td>`;
        }).join('');
        const risk = app.analytics.getRiskLevel(s);
        const improv = app.analytics.calcImprovement ? app.analytics.calcImprovement(s) : null;
        return `<tr>
          <td>${i + 1}</td><td class="sticky-col">${app.utils.esc(s.name)}</td>
          ${mockCells}
          <td><strong>${s._avg.overall?.toFixed(1) ?? '—'}</strong></td>
          <td>${improv !== null ? (improv > 0 ? '+' : '') + improv.toFixed(1) + '%' : '—'}</td>
          <td><span class="risk-pill ${risk.includes('Risk') ? 'risk-at-risk' : (risk === 'Borderline' ? 'risk-borderline' : 'risk-safe')}">${risk}</span></td>
          <td onclick="window.TrackerApp.ui.openNotes('${s.id}')" style="cursor:pointer;">${s.notes ? 'View' : 'Add'}</td>
          <td onclick="window.TrackerApp.ui.openReport('${s.id}')" style="cursor:pointer;">Report</td>
        </tr>`;
      }).join('');
    },

    renderInterventionList: function () {
      if (!app.dom.interventionItems) return;
      const filter = app.state.students.filter(s => app.analytics.getRiskLevel(s) !== 'Safe');
      if (!filter.length) { app.dom.interventionItems.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">All students are on track.</p>'; return; }
      app.dom.interventionItems.innerHTML = filter.map(s => `
        <div class="intervention-item ${app.analytics.getRiskLevel(s) === 'Borderline' ? 'borderline' : ''}">
          <strong>${app.utils.esc(s.name)}</strong> (Avg: ${app.analytics.calcAverages(s).overall?.toFixed(1)}%)
        </div>`).join('');
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
      const improv = app.analytics.calcImprovement ? app.analytics.calcImprovement(s) : null;
      const ranked = app.state.students.map(st => ({ id: st.id, avg: app.analytics.calcAverages(st).overall || 0 })).sort((a, b) => b.avg - a.avg);
      const rank = ranked.findIndex(r => r.id === s.id) + 1;
      let strongest = null, weakest = null, maxS = -1, minS = Infinity;
      app.state.subjects.forEach(sub => { if (avgs[sub.id] !== null && avgs[sub.id] !== undefined) { if (avgs[sub.id] > maxS) { maxS = avgs[sub.id]; strongest = sub.name; } if (avgs[sub.id] < minS) { minS = avgs[sub.id]; weakest = sub.name; } } });
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const riskClass = risk.includes('Risk') ? 'rc-risk' : (risk === 'Borderline' ? 'rc-borderline' : 'rc-safe');
      const avgClass = avg >= 70 ? 'rc-safe' : (avg >= 50 ? 'rc-borderline' : 'rc-risk');
      let scoresHtml = '<table class="rc-table"><thead><tr><th>Subject</th>' + app.state.mocks.map(m => `<th>${app.utils.esc(m.name)}</th>`).join('') + '<th>Average</th></tr></thead><tbody>';
      app.state.subjects.forEach(sub => { scoresHtml += '<tr><td class="rc-subject">' + app.utils.esc(sub.name) + '</td>'; app.state.mocks.forEach(m => { const val = s.scores[m.id]?.[sub.id]; const cls = val !== null && val !== undefined ? (val >= 70 ? 'rc-safe' : (val >= 50 ? 'rc-borderline' : 'rc-risk')) : ''; scoresHtml += `<td class="${cls}">${val ?? '\u2014'}</td>`; }); const subAvg = avgs[sub.id]; scoresHtml += `<td><strong>${subAvg !== null ? subAvg.toFixed(1) : '\u2014'}</strong></td></tr>`; });
      scoresHtml += '</tbody></table>';
      const trendText = improv !== null ? (improv > 0 ? 'Improving \u25B2' : (improv < 0 ? 'Declining \u25BC' : 'Stable')) : 'Insufficient data';
      const trendClass = improv !== null ? (improv > 0 ? 'rc-safe' : (improv < 0 ? 'rc-risk' : '')) : '';
      if (app.dom.reportContainer) {
        app.dom.reportContainer.innerHTML = `<div class="report-card"><div class="rc-header"><div class="rc-school">Vickmore International School</div><div class="rc-location">Krispol City, Asamoah Town</div><div class="rc-title">Academic Performance Report</div></div><div class="rc-info"><div><span>Student:</span> <strong>${app.utils.esc(s.name)}</strong></div><div><span>Class:</span> <strong>JHS 3</strong></div><div><span>Term:</span> <strong>Mock Examination</strong></div><div><span>Date:</span> <strong>${today}</strong></div></div><div class="rc-section"><h4>Subject Performance</h4>${scoresHtml}</div><div class="rc-summary"><div class="rc-summary-item"><span>Overall Average</span><strong class="${avgClass}">${avg.toFixed(1)}%</strong></div><div class="rc-summary-item"><span>Class Rank</span><strong>${rank} / ${app.state.students.length}</strong></div><div class="rc-summary-item"><span>Status</span><strong class="${riskClass}">${risk}</strong></div><div class="rc-summary-item"><span>Improvement</span><strong class="${trendClass}">${improv !== null ? (improv > 0 ? '+' : '') + improv.toFixed(1) + '%' : '\u2014'}</strong></div></div><div class="rc-section"><h4>Performance Analysis</h4><div class="rc-analysis"><div><span>Strongest Subject:</span> <strong>${strongest || '\u2014'}</strong></div><div><span>Weakest Subject:</span> <strong>${weakest || '\u2014'}</strong></div><div><span>Performance Trend:</span> <strong class="${trendClass}">${trendText}</strong></div></div></div><div class="rc-section"><h4>Teacher Comments</h4><div class="rc-notes">${s.notes ? app.utils.esc(s.notes) : 'No comments recorded.'}</div></div><div class="rc-footer"><div class="rc-sig"><div class="rc-sig-line"></div><span>Class Teacher</span></div><div class="rc-sig"><div class="rc-sig-line"></div><span>Head Teacher</span></div></div></div>`;
      }
      if (app.dom.reportModal) app.dom.reportModal.classList.add('active');
    },

    loadScoreFields: function () {
      const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
      const s = app.state.students.find(x => x.id === sid);
      if (s) {
        app.dom.dynamicSubjectFields.innerHTML = app.state.subjects.map(sb => `
          <div class="form-group"><label>${app.utils.esc(sb.name)}</label><input type="number" data-sid="${sb.id}" value="${s.scores[mid]?.[sb.id] ?? ''}"></div>
        `).join('');
      } else {
        app.dom.dynamicSubjectFields.innerHTML = '';
      }
    },

    renderBulkTable: function () {
      if (!app.dom.bulkScoreHead || !app.dom.bulkScoreBody) return;
      
      const headHtml = '<th>Student</th>' + app.state.subjects.map(s => `<th>${app.utils.esc(s.name)}</th>`).join('');
      app.dom.bulkScoreHead.innerHTML = `<tr>${headHtml}</tr>`;
      
      const mockId = app.dom.bulkMockSelect.value;
      const bodyHtml = app.state.students.map(s => {
        const row = app.state.subjects.map(sub => {
          const val = s.scores[mockId]?.[sub.id] ?? '';
          return `<td><input type="number" class="bulk-score-input" data-sid="${s.id}" data-sub="${sub.id}" value="${val}" min="0" max="100"></td>`;
        }).join('');
        return `<tr><td class="sticky-col">${app.utils.esc(s.name)}</td>${row}</tr>`;
      }).join('');
      
      app.dom.bulkScoreBody.innerHTML = bodyHtml;
    },

    refreshUI: function () {
      console.log("Refreshing UI...");
      try {
        if (app.dom.emptyMsg) app.dom.emptyMsg.style.display = app.state.students.length ? 'none' : 'block';
        this.updateDashboardStats();
        this.renderStudentChips();
        this.populateSelects();
        this.renderResultsTable();
        if (app.heatmap) app.heatmap.renderHeatmap();
        this.renderInterventionList();
        this.renderClassSummary();
        this.updateBackupStatus();
        this.renderManagement();
        if (app.charts) app.charts.renderStudentChart(app.dom.chartStudentSelect?.value);
        console.log("UI Refresh Complete.");
      } catch (e) {
        console.error("RefreshUI Error:", e);
      }
    },

    renderAll: function () { this.refreshUI(); },

    renderManagement: function () {
      if (!app.dom.mockList || !app.dom.subjectList) return;
      app.dom.mockList.innerHTML = app.state.mocks.map(m => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(m.name)}" onchange="window.TrackerApp.ui.renameMock('${m.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteMock('${m.id}')">×</button>
        </div>`).join('');
      app.dom.subjectList.innerHTML = app.state.subjects.map(s => `
        <div class="mock-item">
          <input type="text" value="${app.utils.esc(s.name)}" onchange="window.TrackerApp.ui.renameSubject('${s.id}', this.value)">
          <button onclick="window.TrackerApp.ui.deleteSubject('${s.id}')">×</button>
        </div>`).join('');
    },

    renameMock: function (id, n) { const m = app.state.mocks.find(x => x.id === id); if (m) { m.name = n.trim(); app.save(); this.refreshUI(); } },
    deleteMock: function (id) { if (app.state.mocks.length > 1 && confirm("Delete mock?")) { app.state.mocks = app.state.mocks.filter(x => x.id !== id); app.save(); this.refreshUI(); } },
    renameSubject: function (id, n) { const s = app.state.subjects.find(x => x.id === id); if (s) { s.name = n.trim(); app.save(); this.refreshUI(); } },
    deleteSubject: function (id) { if (app.state.subjects.length > 1 && confirm("Delete subject?")) { app.state.subjects = app.state.subjects.filter(x => x.id !== id); app.save(); this.refreshUI(); } },

    bindEvents: function () {
      console.log("Binding Events...");
      try {
        if (app.dom.form) app.dom.form.onsubmit = (e) => { e.preventDefault(); app.students.addStudent(app.dom.nameInput.value); app.dom.nameInput.value = ''; };
        if (app.dom.backupBtn) app.dom.backupBtn.onclick = () => app.export.exportBackup();
        if (app.dom.restoreBtn) app.dom.restoreBtn.onclick = () => app.dom.restoreInput.click();
        if (app.dom.restoreInput) app.dom.restoreInput.onchange = (e) => app.export.importBackup(e.target.files[0]);
        if (app.dom.themeToggle) app.dom.themeToggle.onclick = () => { app.state.theme = app.state.theme === 'light' ? 'dark' : 'light'; app.applyTheme(); app.save(); };
        if (app.dom.resetBtn) app.dom.resetBtn.onclick = () => app.dom.resetModal.classList.add('active');
        if (app.dom.resetConfirmBtn) app.dom.resetConfirmBtn.onclick = () => { localStorage.clear(); location.reload(); };
        if (app.dom.resetCancelBtn) app.dom.resetCancelBtn.onclick = () => app.dom.resetModal.classList.remove('active');
        if (app.dom.bulkImportBtn) app.dom.bulkImportBtn.onclick = () => app.dom.bulkImportModal.classList.add('active');
        if (app.dom.bulkImportConfirmBtn) app.dom.bulkImportConfirmBtn.onclick = () => { app.students.bulkImport(app.dom.bulkImportTextarea.value); app.dom.bulkImportModal.classList.remove('active'); };
        if (app.dom.bulkImportCancelBtn) app.dom.bulkImportCancelBtn.onclick = () => app.dom.bulkImportModal.classList.remove('active');
        if (app.dom.editSaveBtn) app.dom.editSaveBtn.onclick = () => app.students.saveEdit();
        if (app.dom.editCancelBtn) app.dom.editCancelBtn.onclick = () => app.dom.editModal.classList.remove('active');
        if (app.dom.deleteConfirmBtn) app.dom.deleteConfirmBtn.onclick = () => app.students.confirmDelete();
        if (app.dom.deleteCancelBtn) app.dom.deleteCancelBtn.onclick = () => app.dom.deleteModal.classList.remove('active');
        if (app.dom.notesSaveBtn) app.dom.notesSaveBtn.onclick = () => this.saveNotes();
        if (app.dom.notesCancelBtn) app.dom.notesCancelBtn.onclick = () => app.dom.notesModal.classList.remove('active');
        if (app.dom.bulkScoreBtn) app.dom.bulkScoreBtn.onclick = () => { app.dom.bulkScoreModal.classList.add('active'); this.renderBulkTable(); };
        if (app.dom.bulkScoreCancelBtn) app.dom.bulkScoreCancelBtn.onclick = () => app.dom.bulkScoreModal.classList.remove('active');
        if (app.dom.bulkScoreSaveBtn) app.dom.bulkScoreSaveBtn.onclick = () => app.students.saveBulkScores(app.dom.bulkMockSelect.value, app.dom.bulkScoreBody.querySelectorAll('.bulk-score-input'));
        if (app.dom.addMockForm) app.dom.addMockForm.onsubmit = (e) => { e.preventDefault(); if (app.dom.mockNameInput.value.trim()) { app.state.mocks.push({ id: app.utils.uuid(), name: app.dom.mockNameInput.value.trim() }); app.save(); this.renderAll(); } app.dom.mockNameInput.value = ''; };
        if (app.dom.addSubjectForm) app.dom.addSubjectForm.onsubmit = (e) => { e.preventDefault(); if (app.dom.subjectNameInput.value.trim()) { app.state.subjects.push({ id: app.utils.uuid(), name: app.dom.subjectNameInput.value.trim() }); app.save(); this.renderAll(); } app.dom.subjectNameInput.value = ''; };
        if (app.dom.saveScoresBtn) app.dom.saveScoresBtn.onclick = () => {
          const sid = app.dom.scoreStudentSelect.value, mid = app.dom.scoreMockSelect.value;
          const scores = {}; app.dom.dynamicSubjectFields.querySelectorAll('input').forEach(f => scores[f.dataset.sid] = f.value !== '' ? parseInt(f.value) : null);
          app.students.saveScores(sid, mid, scores);
        };
        if (app.dom.scoreStudentSelect) app.dom.scoreStudentSelect.onchange = () => this.loadScoreFields();
        if (app.dom.scoreMockSelect) app.dom.scoreMockSelect.onchange = () => this.loadScoreFields();
        if (app.dom.chartStudentSelect) app.dom.chartStudentSelect.onchange = () => app.charts.renderStudentChart(app.dom.chartStudentSelect.value);
        if (app.dom.searchInput) app.dom.searchInput.oninput = (e) => { app.state.searchTerm = e.target.value; this.renderResultsTable(); };
        if (app.dom.reportCloseBtn) app.dom.reportCloseBtn.onclick = () => app.dom.reportModal.classList.remove('active');
        if (app.dom.reportPrintBtn) app.dom.reportPrintBtn.onclick = () => window.print();
        if (app.dom.exportCsvBtn) app.dom.exportCsvBtn.onclick = () => app.export.exportCSV();
        if (app.dom.exportExcelBtn) app.dom.exportExcelBtn.onclick = () => app.export.exportExcel();
        if (app.dom.printBtn) app.dom.printBtn.onclick = () => window.print();

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });
        console.log("Events Bound Successfully.");
      } catch (e) {
        console.error("BindEvents Error:", e);
      }
    }
  };

})(window.TrackerApp);
