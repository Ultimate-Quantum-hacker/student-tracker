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

      const blob = new Blob([csv], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Mock_Results.xlsx';
      a.click();
    }
  };

})(window.TrackerApp);
