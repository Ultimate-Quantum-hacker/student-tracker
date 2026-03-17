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

      const title = 'Student Exam Report';
      const subtitle = 'Generated by Student Exam Tracker';
      const wsData = [
        [title],
        [subtitle],
        [],
        headers,
        ...rows
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Merge title/subtitle across all header columns
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
      ];

      // Auto column widths
      const widths = headers.map((h, idx) => {
        const maxLength = wsData.reduce((max, row) => {
          const value = row[idx];
          const len = value === null || value === undefined ? 1 : String(value).length;
          return Math.max(max, len);
        }, h.length);
        return { wch: Math.min(Math.max(maxLength + 2, 10), 30) };
      });
      ws['!cols'] = widths;

      // Style header row and title/subtitle
      for (let c = 0; c < headers.length; c++) {
        const headerCell = ws[XLSX.utils.encode_cell({ r: 3, c })];
        if (headerCell) {
          headerCell.s = {
            fill: { fgColor: { rgb: '264653' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          };
        }
      }

      const titleCell = ws['A1'];
      if (titleCell) titleCell.s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } };
      const subtitleCell = ws['A2'];
      if (subtitleCell) subtitleCell.s = { font: { italic: true, sz: 11 }, alignment: { horizontal: 'center' } };

      // Apply borders + alignment to all data cells
      const totalRows = wsData.length;
      for (let r = 3; r < totalRows; r++) {
        for (let c = 0; c < headers.length; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef] || (ws[cellRef] = { t: 's', v: '—' });
          if (!cell.s) cell.s = {};
          cell.s.border = {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          };
          if (c === 0 || c === 1) {
            cell.s.alignment = { horizontal: c === 1 ? 'left' : 'center' };
          } else {
            cell.s.alignment = { horizontal: 'center' };
          }
        }
      }

      // Conditional formatting by manual color assignment for Improvement and ranking
      for (let r = 4; r < totalRows; r++) {
        const improvementRef = XLSX.utils.encode_cell({ r, c: headers.length - 1 });
        const rankRef = XLSX.utils.encode_cell({ r, c: 0 });
        const impCell = ws[improvementRef];
        const rankCell = ws[rankRef];

        if (impCell && typeof impCell.v === 'string') {
          const t = impCell.v;
          if (t.startsWith('+')) impCell.s = { ...impCell.s, font: { color: { rgb: '008000' }, bold: true } };
          else if (t.startsWith('-')) impCell.s = { ...impCell.s, font: { color: { rgb: 'FF0000' }, bold: true } };
          else impCell.s = { ...impCell.s, font: { color: { rgb: '6B7280' } } };
        }
        if (rankCell && typeof rankCell.v === 'number') {
          if (rankCell.v === 1) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'FFD700' } } };
          if (rankCell.v === 2) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'C0C0C0' } } };
          if (rankCell.v === 3) rankCell.s = { ...rankCell.s, fill: { fgColor: { rgb: 'CD7F32' } } };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      XLSX.writeFile(wb, 'Mock_Results.xlsx');
      app.ui.showToast('Excel export complete');
    }
  };

})(window.TrackerApp);
