/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — analytics.js
   Handles all calculation and ranking logic.
   ═══════════════════════════════════════════════ */

const analytics = {
    
  mockTotal: function (scores, subjects) {
    let t = 0, c = 0;
    if (!subjects) return null;
    subjects.forEach(s => {
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

  calcAverages: function (student, subjects, exams) {
    let sum = 0, count = 0;
    const subAvgs = {};
    if (!subjects || !exams) return { overall: null };
    
    subjects.forEach(subj => {
      let sSum = 0, sCount = 0;
      exams.forEach(m => {
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

  calcClassAverages: function (students, subjects, exams) {
    if (!students || !subjects || !exams) return [];
    
    return exams.map(m => {
      let sum = 0, count = 0;
      students.forEach(s => {
        const total = this.mockTotal(s.scores[m.id], subjects);
        if (total !== null) {
          sum += total;
          count++;
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

// Export analytics object
export default analytics;
