/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — analytics.js
   Handles all calculation and ranking logic.
   ═══════════════════════════════════════════════ */

(function (app) {
  'use strict';

  app.analytics = {
    
    mockTotal: function (scores) {
      let t = 0, c = 0;
      app.state.subjects.forEach(s => {
        if (scores && scores[s.id] !== undefined && scores[s.id] !== null) {
          t += scores[s.id];
          c++;
        }
      });
      return c > 0 ? t : null;
    },

    calcAverages: function (student) {
      let sum = 0, count = 0;
      const subAvgs = {};
      app.state.subjects.forEach(subj => {
        let sSum = 0, sCount = 0;
        app.state.mocks.forEach(m => {
          const val = student.scores[m.id]?.[subj.id];
          if (val !== null && val !== undefined) {
            sSum += val;
            sCount++;
            sum += val;
            count++;
          }
        });
        subAvgs[subj.id] = sCount ? (sSum / sCount) : null;
      });
      subAvgs.overall = count ? (sum / count) : null;
      return subAvgs;
    },

    getRiskLevel: function (student) {
      const avgs = this.calcAverages(student);
      const avg = avgs.overall;
      if (avg === null) return 'N/A';
      if (avg >= 70) return 'Strong';
      if (avg >= 50) return 'Average';
      return 'Needs Support';
    },

    calcImprovement: function (student) {
      if (!app.state.mocks || app.state.mocks.length < 2) return null;
      let scores = [];
      app.state.mocks.forEach(m => {
        const total = this.mockTotal(student.scores[m.id]);
        if (total !== null) scores.push(total);
      });
      if (scores.length < 2) return null;
      const first = scores[0], last = scores[scores.length - 1];
      if (first === 0) return last > 0 ? 100 : 0;
      return ((last - first) / first) * 100;
    },

    calcClassAverages: function () {
      return app.state.mocks.map(m => {
        const result = { name: m.name, id: m.id };
        let mockTotalSum = 0, mockTotalCount = 0;
        app.state.subjects.forEach(s => {
          let subjSum = 0, subjCount = 0;
          app.state.students.forEach(st => {
            const sc = st.scores[m.id]?.[s.id];
            if (sc !== null && sc !== undefined) {
              subjSum += sc;
              subjCount++;
              mockTotalSum += sc;
              mockTotalCount++;
            }
          });
          result[s.id + 'Avg'] = subjCount ? (subjSum / subjCount) : null;
        });
        result.overall = mockTotalCount ? (mockTotalSum / mockTotalCount) : null;
        return result;
      });
    },

    getWeakestSubject: function (student) {
      const avgs = this.calcAverages(student);
      let weakest = null, min = Infinity;
      app.state.subjects.forEach(s => {
        if (avgs[s.id] !== null) {
          if (avgs[s.id] < min) { min = avgs[s.id]; weakest = s.name; }
        }
      });
      return weakest || '—';
    }
  };

})(window.TrackerApp);
