/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — export.js
   Handles CSV, Excel, and JSON Backup/Restore.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.export = {
    
    exportBackup: function () {
      app.state.lastBackup = new Date().toISOString();
      app.save();
      app.ui.updateBackupStatus();
      
      const data = {
        students: app.state.students,
        mocks: app.state.mocks,
        subjects: app.state.subjects,
        lastBackup: app.state.lastBackup,
        theme: app.state.theme
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JHS3_Tracker_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      app.ui.showToast('Backup downloaded');
    },

    importBackup: function (file) {
      if (!file) {
        app.ui.showToast("No file selected");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (confirm("Import backup? This will REPLACE current data.")) {
            app.state.students = data.students || [];
            app.state.mocks = data.mocks || [];
            app.state.subjects = data.subjects || [];
            app.state.lastBackup = data.lastBackup || null;
            app.state.theme = data.theme || "light";
            
            app.save();
            app.applyTheme(app.state.theme);
            app.ui.refreshUI();
            app.ui.showToast("Backup restored successfully");
          } else {
            app.ui.showToast("Import cancelled");
          }
        } catch (err) {
          console.error("Import error:", err);
          app.ui.showToast("Invalid backup file: " + err.message);
        }
        app.dom.restoreInput.value = "";
      };
      reader.onerror = () => {
        app.ui.showToast("Error reading file");
        app.dom.restoreInput.value = "";
      };
      reader.readAsText(file);
    },

    exportCSV: function () {
      let csv = 'Rank,Student,' + app.state.mocks.map(m => `"${m.name}"`).join(',') + ',Overall Average\n';
      
      const ranked = app.state.students.map(s => ({ 
        ...s, 
        _avg: app.analytics.calcAverages(s) 
      })).sort((a, b) => (b._avg.overall || 0) - (a._avg.overall || 0));

      ranked.forEach((s, i) => {
        const scores = app.state.mocks.map(m => {
          const t = app.analytics.mockTotal(s.scores[m.id]);
          return t !== null ? t : '';
        }).join(',');
        
        csv += `${i + 1},"${s.name}",${scores},${s._avg.overall?.toFixed(1) || ''}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Mock_Results.csv';
      a.click();
    },

    exportExcel: function () {
      if (!window.XLSX) {
        app.ui.showToast('Excel export unavailable. Please reload and try again.');
        return;
      }

      const headers = [
        'Rank',
        'Student Name',
        ...app.state.subjects.map(s => s.name || 'Subject'),
        'Total Score',
        'Previous Score',
        'Improvement'
      ];

      const ranked = app.state.students.map((s) => ({
        ...s,
        _avg: app.analytics.calcAverages(s)
      })).sort((a, b) => (b._avg.overall || 0) - (a._avg.overall || 0));

      const rows = ranked.map((s, i) => {
        const currentMock = app.state.mocks[app.state.mocks.length - 1];
        const previousMock = app.state.mocks[app.state.mocks.length - 2];
        const currentScore = currentMock ? app.analytics.mockTotal(s.scores[currentMock.id] || {}) : null;
        const previousMockScore = previousMock ? app.analytics.mockTotal(s.scores[previousMock.id] || {}) : null;
        const prevStorage = JSON.parse(localStorage.getItem('previousScores') || '{}');
        const prevStored = prevStorage[s.id] ?? prevStorage[s.name] ?? null;
        const previousScore = previousMockScore !== null ? previousMockScore : (prevStored !== undefined ? prevStored : null);
        const improvement = app.ui.formatImprovement(currentScore, previousScore);

        const subjectScores = app.state.subjects.map(sub => {
          const v = s.scores[currentMock?.id]?.[sub.id];
          return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v);
        });

        return [
          i + 1,
          s.name || '—',
          ...subjectScores,
          currentScore !== null && !isNaN(currentScore) ? Number(currentScore) : '—',
          previousScore !== null && !isNaN(previousScore) ? Number(previousScore) : '—',
          improvement.text === '—' ? '—' : improvement.text
        ];
      });

      const title = 'STUDENT EXAM REPORT';
      const subtitle = 'Generated by Student Exam Tracker';
      const schoolInfo = ['School Name: __________________', 'Class: __________________', 'Term: __________________'];
      const wsData = [
        [title],
        [subtitle],
        [],
        [schoolInfo[0]],
        [schoolInfo[1]],
        [schoolInfo[2]],
        [],
        headers,
        ...rows
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      const lastCol = headers.length - 1;
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: lastCol } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: lastCol } }
      ];

      const colWidths = headers.map((h, idx) => {
        const values = wsData.map(r => r[idx]);
        const width = values.reduce((m, v) => {
          const len = v === undefined || v === null ? 1 : String(v).length;
          return Math.max(m, len);
        }, h.length);
        if (idx === 1) return { wch: Math.max(width + 4, 18) };
        if (idx === 0 || idx >= headers.length - 3) return { wch: Math.max(width + 2, 10) };
        return { wch: Math.max(width + 2, 12) };
      });
      ws['!cols'] = colWidths;

      const setStyle = (cell, style) => { cell.s = { ...cell.s, ...style }; };
      const titleCell = ws['A1'];
      if (titleCell) setStyle(titleCell, { font: { bold: true, sz: 18, color: { rgb: '003366' } }, alignment: { horizontal: 'center' } });
      const subtitleCell = ws['A2'];
      if (subtitleCell) setStyle(subtitleCell, { font: { italic: true, sz: 11, color: { rgb: '4B5563' } }, alignment: { horizontal: 'center' } });

      for (let c = 0; c <= lastCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 7, c })];
        if (!cell) continue;
        setStyle(cell, {
          fill: { fgColor: { rgb: '264653' } },
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        });
      }

      const rowCount = wsData.length;
      for (let r = 8; r < rowCount; r++) {
        const isZebra = (r % 2 === 0);
        for (let c = 0; c <= lastCol; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          let cell = ws[ref];
          if (!cell) { cell = { t: 's', v: '—' }; ws[ref] = cell; }
          if (!cell.s) cell.s = {};

          const baseBorder = {
            top: { style: 'thin', color: { rgb: 'B0B0B0' } },
            bottom: { style: 'thin', color: { rgb: 'B0B0B0' } },
            left: { style: 'thin', color: { rgb: 'B0B0B0' } },
            right: { style: 'thin', color: { rgb: 'B0B0B0' } }
          };
          cell.s.border = baseBorder;
          cell.s.fill = isZebra ? { fgColor: { rgb: 'F4F9FF' } } : { fgColor: { rgb: 'FFFFFF' } };

          if (c === 1) {
            cell.s.alignment = { horizontal: 'left', vertical: 'center' };
          } else {
            cell.s.alignment = { horizontal: 'center', vertical: 'center' };
          }
        }
      }

      const footerRow = rowCount;
      const footerTitle = `Generated on: ${new Date().toLocaleDateString()}`;
      const footerSub = 'Powered by Student Exam Tracker';
      XLSX.utils.sheet_add_aoa(ws, [[footerTitle]], { origin: { r: footerRow, c: 0 } });
      XLSX.utils.sheet_add_aoa(ws, [[footerSub]], { origin: { r: footerRow + 1, c: 0 } });
      ws['!merges'].push({ s: { r: footerRow, c: 0 }, e: { r: footerRow, c: lastCol } });
      ws['!merges'].push({ s: { r: footerRow + 1, c: 0 }, e: { r: footerRow + 1, c: lastCol } });
      const f1 = ws['A' + (footerRow + 1)]; if (f1) setStyle(f1, { font: { color: { rgb: '6B7280' }, sz: 10 }, alignment: { horizontal: 'left' } });
      const f0 = ws['A' + (footerRow)]; if (f0) setStyle(f0, { font: { color: { rgb: '4B5563' }, sz: 10 }, alignment: { horizontal: 'left' } });

      // Improvement and rank highlights
      for (let r = 8; r < rowCount; r++) {
        const improvementCell = ws[XLSX.utils.encode_cell({ r, c: lastCol })];
        if (improvementCell) {
          const v = String(improvementCell.v || '');
          if (v.startsWith('+')) improvementCell.s = { ...improvementCell.s, font: { color: { rgb: '0A8A00' }, bold: true } };
          else if (v.startsWith('-')) improvementCell.s = { ...improvementCell.s, font: { color: { rgb: 'D63131' }, bold: true } };
          else improvementCell.s = { ...improvementCell.s, font: { color: { rgb: '6B7280' } } };
        }

        const rankCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        if (rankCell && typeof rankCell.v === 'number') {
          if (rankCell.v === 1) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'FFF3BF' } } };
          if (rankCell.v === 2) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'E9ECEF' } } };
          if (rankCell.v === 3) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'F4E1D2' } } };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Student Report');
      XLSX.writeFile(wb, 'Student_Exam_Report.xlsx');
      app.ui.showToast('Excel report generated');
    }
  };

})(window.TrackerApp);
