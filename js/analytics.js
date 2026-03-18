/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — analytics.js
   Handles all calculation and ranking logic.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const analytics = {
  mockTotal: function (scores) {
    let t = 0;
    let c = 0;
    app.state.subjects.forEach(s => {
      const v = scores && scores[s.id];
      if (v !== undefined && v !== null && !isNaN(v)) {
        const num = Number(v);
        if (!isNaN(num)) {
          t += num;
          c++;
        }
      }
    });
    return c > 0 ? t : null;
  },

  calcAverages: function (student) {
    let sum = 0;
    let count = 0;
    const subAvgs = {};

    app.state.subjects.forEach(subj => {
      let sSum = 0;
      let sCount = 0;
      app.state.exams.forEach(m => {
        const val = student.scores?.[m.id]?.[subj.id];
        if (val !== null && val !== undefined && !isNaN(val)) {
          sSum += Number(val);
          sCount++;
          sum += Number(val);
          count++;
        }
      });
      subAvgs[subj.id] = sCount ? (sSum / sCount) : null;
    });

    subAvgs.overall = count ? (sum / count) : null;
    return subAvgs;
  },

  calcClassAverages: function () {
    return app.state.exams.map(exam => {
      let sum = 0;
      let count = 0;
      app.state.students.forEach(student => {
        const total = this.mockTotal(student.scores?.[exam.id]);
        if (total !== null) {
          sum += total;
          count++;
        }
      });
      return {
        id: exam.id,
        name: exam.title || exam.name,
        overall: count ? (sum / count) : null
      };
    });
  },

  getRiskLevel: function (student) {
    const avgs = this.calcAverages(student);
    const avg = avgs.overall ?? 0;
    if (avg >= 70) return 'Safe';
    if (avg >= 50) return 'Average';
    return 'Needs Support';
  },

  getWeakestSubject: function (student) {
    const avgs = this.calcAverages(student);
    let weakest = null;
    let min = Infinity;
    app.state.subjects.forEach(s => {
      if (avgs[s.id] !== null && avgs[s.id] < min) {
        min = avgs[s.id];
        weakest = s.name;
      }
    });
    return weakest || '—';
  }
};

app.analytics = analytics;

export default analytics;
