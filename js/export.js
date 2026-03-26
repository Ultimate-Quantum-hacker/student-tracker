/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — export.js
   Handles CSV, Excel, and JSON Backup/Restore.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const exportModule = {
    isExcelExporting: false,
    xlsxLoadPromise: null,

    getExportDateStamp: function () {
      return new Date().toISOString().split('T')[0];
    },

    getTeacherNameForExport: function (app) {
      if (typeof app.ui?.getTeacherNameForExport === 'function') {
        return app.ui.getTeacherNameForExport();
      }
      const globalTeacherName = typeof window !== 'undefined'
        ? String(window.__TEACHER_NAME__ || window.teacherName || '').trim()
        : '';
      return globalTeacherName || 'N/A';
    },

    setExcelExportState: function (app, isLoading) {
      this.isExcelExporting = !!isLoading;
      const button = app?.dom?.exportExcelBtn;
      if (!button) return;

      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent || 'Excel';
      }

      button.disabled = !!isLoading;
      button.textContent = isLoading ? 'Generating report...' : button.dataset.originalLabel;
    },

    hasValidXlsx: function () {
      return !!(window.XLSX && window.XLSX.utils && window.XLSX.writeFile);
    },

    loadScript: function (src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (this.hasValidXlsx()) {
            resolve();
            return;
          }

          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    },

    ensureXlsxLibrary: async function () {
      if (this.hasValidXlsx()) {
        return true;
      }

      if (this.xlsxLoadPromise) {
        await this.xlsxLoadPromise;
        return this.hasValidXlsx();
      }

      const sources = [
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
      ];

      this.xlsxLoadPromise = (async () => {
        for (const src of sources) {
          try {
            await this.loadScript(src);
            if (this.hasValidXlsx()) {
              return true;
            }
          } catch (error) {
            console.warn('Unable to load XLSX source:', src, error);
          }
        }

        return false;
      })();

      try {
        await this.xlsxLoadPromise;
      } finally {
        this.xlsxLoadPromise = null;
      }

      return this.hasValidXlsx();
    },
    
    exportBackup: function (app) {
      app.state.lastBackup = new Date().toISOString();
      app.save();
      app.ui.updateBackupStatus();
      
      const data = {
        students: app.state.students,
        exams: app.state.exams,
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

    importBackup: function (file, app) {
      if (!file) {
        app.ui.showToast("No file selected");
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (confirm("Import backup? This will REPLACE current data.")) {
            if (app.snapshots && typeof app.snapshots.saveSnapshot === 'function') {
              app.snapshots.saveSnapshot('Auto Backup Before Backup Restore');
            }

            await app.importData({
              students: data.students || [],
              exams: data.exams || [],
              subjects: data.subjects || []
            });

            app.state.lastBackup = data.lastBackup || null;
            app.state.theme = data.theme || "light";

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

    exportCSV: function (app) {
      let csv = 'Rank,Student,' + app.state.exams.map(m => `"${m.title || m.name}"`).join(',') + ',Overall Average\n';
      
      const ranked = app.state.students.map(s => ({ 
        ...s, 
        _avg: app.analytics.calcAverages(s, app.state.subjects, app.state.exams) 
      })).sort((a, b) => (b._avg.overall || 0) - (a._avg.overall || 0));

      ranked.forEach((s, i) => {
        const scores = app.state.exams.map(m => {
          const t = app.analytics.getTotal(s, m);
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

    exportExcel: async function (app) {
      if (this.isExcelExporting) {
        return;
      }

      try {
        const xlsxReady = await this.ensureXlsxLibrary();
        if (!xlsxReady) {
          console.error('Excel export library missing or incompatible', window.XLSX);
          app.ui.showToast('Excel export unavailable. Check connection and try again.');
          return;
        }

        if (app.state.isLoading) {
          app.ui.showToast('Please wait for data to finish loading');
          return;
        }

        const students = Array.isArray(app.state.students) ? app.state.students : [];
        if (!students.length) {
          app.ui.showToast('No students to export');
          return;
        }

        this.setExcelExportState(app, true);

        const dateStamp = this.getExportDateStamp();
        const generatedAt = new Date().toLocaleString();
        const teacherName = this.getTeacherNameForExport(app);
        const latestExam = app.analytics.getLatestExam();
        const latestExamLabel = app.analytics.getExamLabel(latestExam) || 'N/A';
        const headers = ['Name', 'Subjects', 'Scores', 'Total', 'Average', 'Status'];
        const statusLabelMap = {
          strong: 'Strong',
          good: 'Good',
          average: 'Average',
          borderline: 'Borderline',
          'at-risk': 'At Risk',
          'no-data': 'No Data',
          incomplete: 'N/A'
        };

        const ranked = students
          .map(student => ({
            ...student,
            _overallAvg: app.analytics.getStudentOverallAverage(student)
          }))
          .sort((a, b) => (b._overallAvg ?? -1) - (a._overallAvg ?? -1));

        const rows = ranked.map((student) => {
          const subjectNames = (app.state.subjects || []).map(subject => subject.name || '').filter(Boolean);
          const subjectsText = subjectNames.length ? subjectNames.join(', ') : 'N/A';

          const scoreParts = subjectNames.map((subjectName) => {
            const raw = latestExam ? app.analytics.getScore(student, subjectName, latestExam) : '';
            const numeric = Number(raw);
            const displayScore = (raw === '' || raw === null || raw === undefined || isNaN(numeric))
              ? 'N/A'
              : String(numeric);
            return `${subjectName}: ${displayScore}`;
          });

          const scoresText = scoreParts.length ? scoreParts.join(' | ') : 'N/A';
          const total = latestExam ? app.analytics.getTotal(student, latestExam) : null;
          const average = app.analytics.getStudentOverallAverage(student);
          const hasNumericTotal = total !== null && total !== undefined && !isNaN(total);
          const hasNumericAverage = average !== null && average !== undefined && !isNaN(average);
          const statusKey = app.analytics.getStudentStatus(student, latestExam);
          const statusLabel = typeof app.ui?.formatStatusLabel === 'function'
            ? app.ui.formatStatusLabel(statusKey)
            : (statusLabelMap[statusKey] || 'No Data');

          return [
            student.name || 'N/A',
            subjectsText,
            scoresText,
            hasNumericTotal ? Number(total) : 'N/A',
            hasNumericAverage ? Number(average).toFixed(1) : 'N/A',
            statusLabel
          ];
        });

        const wsData = [
          ['Student Performance Report'],
          [`Date Generated: ${generatedAt}`],
          [`Teacher: ${teacherName}`],
          [`Latest Exam: ${latestExamLabel}`],
          [],
          headers,
          ...rows
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const lastCol = headers.length - 1;
        const headerRowIndex = 5;
        const dataStartRowIndex = headerRowIndex + 1;
        const totalRows = wsData.length;

        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
          { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
          { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } }
        ];

        ws['!autofilter'] = { ref: `A${headerRowIndex + 1}:F${headerRowIndex + 1}` };
        ws['!freeze'] = {
          xSplit: 0,
          ySplit: dataStartRowIndex,
          topLeftCell: `A${dataStartRowIndex + 1}`,
          activePane: 'bottomLeft',
          state: 'frozen'
        };

        const computeColumnWidth = (colIndex, minWidth, maxWidth) => {
          const longest = wsData.reduce((max, row) => {
            const value = row[colIndex];
            const len = value === null || value === undefined ? 0 : String(value).length;
            return Math.max(max, len);
          }, headers[colIndex]?.length || minWidth);
          return Math.max(minWidth, Math.min(maxWidth, longest + 2));
        };

        ws['!cols'] = [
          { wch: computeColumnWidth(0, 20, 30) },
          { wch: computeColumnWidth(1, 28, 40) },
          { wch: computeColumnWidth(2, 42, 70) },
          { wch: computeColumnWidth(3, 10, 14) },
          { wch: computeColumnWidth(4, 10, 14) },
          { wch: computeColumnWidth(5, 12, 18) }
        ];
        ws['!rows'] = [
          { hpt: 28 },
          { hpt: 19 },
          { hpt: 19 },
          { hpt: 19 },
          { hpt: 8 },
          { hpt: 22 }
        ];

        const setStyle = (cell, style) => {
          if (!cell) return;
          cell.s = { ...(cell.s || {}), ...style };
        };

        const PALETTE = {
          darkHeader: '1E3A8A',
          metaBg: 'F3F4F6',
          headerBg: '2563EB',
          rowAlt: 'F9FAFB',
          border: 'CBD5E1',
          statusStrongBg: '16A34A',
          statusGoodBg: '2563EB',
          statusAverageBg: 'FACC15',
          statusBorderlineBg: 'FB923C',
          statusRiskBg: 'DC2626',
          statusNeutralBg: '64748B'
        };

        setStyle(ws.A1, {
          fill: { fgColor: { rgb: PALETTE.darkHeader } },
          font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            bottom: { style: 'medium', color: { rgb: PALETTE.border } }
          }
        });

        ['A2', 'A3', 'A4'].forEach((ref) => {
          setStyle(ws[ref], {
            fill: { fgColor: { rgb: PALETTE.metaBg } },
            font: { sz: 12, color: { rgb: '334155' } },
            alignment: { horizontal: 'left', vertical: 'center' }
          });
        });

        for (let c = 0; c <= lastCol; c += 1) {
          const ref = XLSX.utils.encode_cell({ r: headerRowIndex, c });
          setStyle(ws[ref], {
            fill: { fgColor: { rgb: PALETTE.headerBg } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'medium', color: { rgb: PALETTE.border } },
              bottom: { style: 'medium', color: { rgb: PALETTE.border } },
              left: { style: 'medium', color: { rgb: PALETTE.border } },
              right: { style: 'medium', color: { rgb: PALETTE.border } }
            }
          });
        }

        const getStatusStyle = (statusValue) => {
          const status = String(statusValue || '').trim().toLowerCase();
          if (status === 'strong') {
            return { fill: { fgColor: { rgb: PALETTE.statusStrongBg } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
          }
          if (status === 'good') {
            return { fill: { fgColor: { rgb: PALETTE.statusGoodBg } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
          }
          if (status === 'average') {
            return { fill: { fgColor: { rgb: PALETTE.statusAverageBg } }, font: { bold: true, color: { rgb: '111827' } } };
          }
          if (status === 'borderline') {
            return { fill: { fgColor: { rgb: PALETTE.statusBorderlineBg } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
          }
          if (status === 'at risk') {
            return { fill: { fgColor: { rgb: PALETTE.statusRiskBg } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
          }
          return { fill: { fgColor: { rgb: PALETTE.statusNeutralBg } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
        };

        for (let r = dataStartRowIndex; r < totalRows; r += 1) {
          const isAltRow = ((r - dataStartRowIndex) % 2) === 1;
          for (let c = 0; c <= lastCol; c += 1) {
            const ref = XLSX.utils.encode_cell({ r, c });
            const alignment = (c <= 2)
              ? { horizontal: 'left', vertical: 'top', wrapText: true }
              : { horizontal: 'center', vertical: 'center' };

            setStyle(ws[ref], {
              fill: { fgColor: { rgb: isAltRow ? PALETTE.rowAlt : 'FFFFFF' } },
              alignment,
              font: { color: { rgb: '0F172A' } },
              border: {
                top: { style: 'thin', color: { rgb: PALETTE.border } },
                bottom: { style: 'thin', color: { rgb: PALETTE.border } },
                left: { style: 'thin', color: { rgb: PALETTE.border } },
                right: { style: 'thin', color: { rgb: PALETTE.border } }
              }
            });
          }

          const statusRef = XLSX.utils.encode_cell({ r, c: 5 });
          const statusCell = ws[statusRef];
          if (statusCell) {
            const statusStyle = getStatusStyle(statusCell.v);
            setStyle(statusCell, {
              ...statusStyle,
              alignment: { horizontal: 'center', vertical: 'center' },
              border: {
                top: { style: 'thin', color: { rgb: PALETTE.border } },
                bottom: { style: 'thin', color: { rgb: PALETTE.border } },
                left: { style: 'thin', color: { rgb: PALETTE.border } },
                right: { style: 'thin', color: { rgb: PALETTE.border } }
              }
            });
          }
        }

        for (let r = headerRowIndex; r < totalRows; r += 1) {
          const leftRef = XLSX.utils.encode_cell({ r, c: 0 });
          const rightRef = XLSX.utils.encode_cell({ r, c: lastCol });
          const leftCell = ws[leftRef];
          const rightCell = ws[rightRef];

          if (leftCell) {
            setStyle(leftCell, {
              border: {
                ...(leftCell.s?.border || {}),
                left: { style: 'medium', color: { rgb: PALETTE.border } }
              }
            });
          }

          if (rightCell) {
            setStyle(rightCell, {
              border: {
                ...(rightCell.s?.border || {}),
                right: { style: 'medium', color: { rgb: PALETTE.border } }
              }
            });
          }
        }

        const lastTableRowIndex = Math.max(dataStartRowIndex, totalRows - 1);
        for (let c = 0; c <= lastCol; c += 1) {
          const bottomRef = XLSX.utils.encode_cell({ r: lastTableRowIndex, c });
          const bottomCell = ws[bottomRef];
          if (!bottomCell) continue;
          setStyle(bottomCell, {
            border: {
              ...(bottomCell.s?.border || {}),
              bottom: { style: 'medium', color: { rgb: PALETTE.border } }
            }
          });
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Performance Report');
        XLSX.writeFile(wb, `student-data-${dateStamp}.xlsx`, { bookType: 'xlsx', cellStyles: true });

        app.ui.showToast('Export complete');
      } catch (err) {
        console.error('Excel export error:', err);
        app.ui.showToast('Excel export failed. See console for details.');
      } finally {
        this.setExcelExportState(app, false);
      }
    }
};

// Register on shared app instance
app.export = exportModule;
export default exportModule;
