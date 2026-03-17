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

      // Professional palette
      const PALETTE = {
        primary: '1F2937',      // dark slate
        primarySoft: '2D3748',
        accentPositive: '0F9D58',
        accentNegative: 'D93025',
        accentNeutral: 'F59E0B',
        lightRow: 'F3F4F6',
        lightBlue: 'EEF2FF',
        darkHeader: '0F172A',
        footerBg: 'F3F4F6',
        border: 'CBD5E1'
      };

      // Title and subtitle rows
      const titleCell = ws['A1'];
      if (titleCell) {
        setStyle(titleCell, {
          fill: { fgColor: { rgb: PALETTE.darkHeader } },
          font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        });
      }
      const subtitleCell = ws['A2'];
      if (subtitleCell) {
        setStyle(subtitleCell, {
          fill: { fgColor: { rgb: '1E293B' } },
          font: { italic: true, sz: 11, color: { rgb: 'D1D5DB' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        });
      }

      // School details row styling
      ['A4', 'A5', 'A6'].forEach((ref) => {
        const cell = ws[ref];
        if (!cell) return;
        setStyle(cell, { font: { color: { rgb: '334155' }, sz: 10 }, alignment: { horizontal: 'left' } });
      });

      // Header row (row 8 in 1-indexed view, 7 in 0-indexed)
      for (let c = 0; c <= lastCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 7, c })];
        if (!cell) continue;
        setStyle(cell, {
          fill: { fgColor: { rgb: PALETTE.primary } },
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: PALETTE.border } },
            bottom: { style: 'thin', color: { rgb: PALETTE.border } },
            left: { style: 'thin', color: { rgb: PALETTE.border } },
            right: { style: 'thin', color: { rgb: PALETTE.border } }
          }
        });
      }

      const rowCount = wsData.length;
      for (let r = 8; r < rowCount; r++) {
        const isEvenRow = ((r - 8) % 2) === 1;
        const rowFill = isEvenRow ? { fgColor: { rgb: PALETTE.lightRow } } : { fgColor: { rgb: 'FFFFFF' } };

        for (let c = 0; c <= lastCol; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          let cell = ws[ref];
          if (!cell) {
            cell = { t: 's', v: '—' };
            ws[ref] = cell;
          }
          if (!cell.s) cell.s = {};

          cell.s.border = {
            top: { style: 'thin', color: { rgb: PALETTE.border } },
            bottom: { style: 'thin', color: { rgb: PALETTE.border } },
            left: { style: 'thin', color: { rgb: PALETTE.border } },
            right: { style: 'thin', color: { rgb: PALETTE.border } }
          };
          cell.s.fill = rowFill;

          // Default alignment
          cell.s.alignment = { horizontal: 'center', vertical: 'center' };
          if (c === 1) {
            cell.s.alignment.horizontal = 'left';
          }
        }

        // Key columns highlight for each row
        const totalColRef = XLSX.utils.encode_cell({ r, c: headers.length - 3 });
        const prevColRef = XLSX.utils.encode_cell({ r, c: headers.length - 2 });
        const improveColRef = XLSX.utils.encode_cell({ r, c: headers.length - 1 });
        const rankCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];

        if (rankCell) {
          setStyle(rankCell, {
            font: { bold: true, color: { rgb: '0F172A' } },
            alignment: { horizontal: 'center', vertical: 'center' }
          });
          if (rankCell.v === 1) {
            setStyle(rankCell, { fill: { fgColor: { rgb: 'FFF7CD' } } });
          } else if (rankCell.v === 2) {
            setStyle(rankCell, { fill: { fgColor: { rgb: 'E9EDF6' } } });
          } else if (rankCell.v === 3) {
            setStyle(rankCell, { fill: { fgColor: { rgb: 'FDE8D2' } } });
          }
        }

        const totalCell = ws[totalColRef];
        if (totalCell) {
          setStyle(totalCell, {
            font: { bold: true, color: { rgb: '1D4ED8' } },
            fill: { fgColor: { rgb: 'DBEAFE' } },
            alignment: { horizontal: 'center', vertical: 'center' }
          });
        }

        if (prevColRef in ws) {
          const prevCell = ws[prevColRef];
          setStyle(prevCell, { alignment: { horizontal: 'center', vertical: 'center' } });
        }

        const improveCell = ws[improveColRef];
        if (improveCell) {
          const value = String(improveCell.v || '');
          if (value.startsWith('+')) {
            setStyle(improveCell, {
              font: { bold: true, color: { rgb: '0F9D58' } },
              fill: { fgColor: { rgb: 'ECFDF3' } }
            });
          } else if (value.startsWith('-')) {
            setStyle(improveCell, {
              font: { bold: true, color: { rgb: 'D93025' } },
              fill: { fgColor: { rgb: 'FEF3F2' } }
            });
          } else {
            setStyle(improveCell, {
              font: { color: { rgb: '6B7280' } },
              fill: { fgColor: { rgb: 'FFFFFF' } }
            });
          }
        }
      }

      // Footer
      const footerRow = rowCount;
      const footerTitle = `Generated on: ${new Date().toLocaleDateString()}`;
      const footerSub = 'Powered by Student Exam Tracker';
      XLSX.utils.sheet_add_aoa(ws, [[footerTitle]], { origin: { r: footerRow, c: 0 } });
      XLSX.utils.sheet_add_aoa(ws, [[footerSub]], { origin: { r: footerRow + 1, c: 0 } });
      ws['!merges'].push({ s: { r: footerRow, c: 0 }, e: { r: footerRow, c: lastCol } });
      ws['!merges'].push({ s: { r: footerRow + 1, c: 0 }, e: { r: footerRow + 1, c: lastCol } });
      const footer1 = ws[`A${footerRow + 1}`];
      if (footer1) {
        setStyle(footer1, {
          fill: { fgColor: { rgb: PALETTE.footerBg } },
          font: { color: { rgb: '475569' }, italic: true, sz: 10 },
          alignment: { horizontal: 'left', vertical: 'center' }
        });
      }
      const footer0 = ws[`A${footerRow}`];
      if (footer0) {
        setStyle(footer0, {
          fill: { fgColor: { rgb: PALETTE.footerBg } },
          font: { color: { rgb: '334155' }, sz: 10 },
          alignment: { horizontal: 'left', vertical: 'center' }
        });
      }

      // Ensure merged title area text color remains white
      const titleRange = ['A1', 'A2'];
      titleRange.forEach((ref) => {
        const cell = ws[ref];
        if (cell && cell.s && cell.s.font) {
          cell.s.font.color = { rgb: 'FFFFFF' };
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Student Report');
      XLSX.writeFile(wb, 'Student_Exam_Report.xlsx', { bookType: 'xlsx', cellStyles: true });
      app.ui.showToast('Excel report generated');
    }
  };

})(window.TrackerApp);
