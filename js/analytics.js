/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — analytics.js
   Handles all calculation and ranking logic.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const analytics = {
  normalizeScore: function (value) {
    const num = Number(value);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(100, num));
  },

  getExamLabel: function (exam) {
    if (typeof exam === 'string') return exam;
    return exam?.title || exam?.name || '';
  },

  getSubjectLabel: function (subject) {
    if (typeof subject === 'string') return subject;
    return subject?.name || '';
  },

  getLatestExam: function () {
    const exams = app.state.exams || [];
    if (!exams.length) return '';
    return this.getExamLabel(exams[exams.length - 1]);
  },

  getPreviousExam: function () {
    const exams = app.state.exams || [];
    if (exams.length < 2) return '';
    return this.getExamLabel(exams[exams.length - 2]);
  },

  getScore: function (student, subject, exam) {
    const subjectLabel = this.getSubjectLabel(subject);
    const examLabel = this.getExamLabel(exam);
    return student?.scores?.[subjectLabel]?.[examLabel] ?? '';
  },

  getTotal: function (student, exam) {
    const examLabel = this.getExamLabel(exam);
    if (!examLabel) return null;

    let total = 0;
    let hasAnyScore = false;

    (app.state.subjects || []).forEach(subject => {
      const score = this.getScore(student, subject, examLabel);
      if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
        total += Number(score);
        hasAnyScore = true;
      }
    });

    return hasAnyScore ? total : null;
  },

  mockTotal: function (scores, exam) {
    if (!scores) return null;

    const examLabel = this.getExamLabel(exam) || this.getLatestExam();
    let total = 0;
    let count = 0;

    (app.state.subjects || []).forEach(subject => {
      const subjectLabel = this.getSubjectLabel(subject);
      const value = scores?.[subjectLabel]?.[examLabel];
      if (value !== '' && value !== undefined && value !== null && !isNaN(value)) {
        total += Number(value);
        count++;
      }
    });

    return count ? total : null;
  },

  getAverage: function (student, exam) {
    const examLabel = this.getExamLabel(exam);
    if (!examLabel) return 0;

    let total = 0;
    let count = 0;

    (app.state.subjects || []).forEach(subject => {
      const score = this.getScore(student, subject, examLabel);
      if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
        total += Number(score);
        count++;
      }
    });

    return count ? total / count : 0;
  },

  getImprovement: function (student, fromExam, toExam) {
    const from = this.getTotal(student, fromExam);
    const to = this.getTotal(student, toExam);

    if (from === null || to === null || from === 0) return null;
    return ((to - from) / from) * 100;
  },

  calcAverages: function (student) {
    const subAvgs = {};
    let sum = 0;
    let count = 0;

    (app.state.subjects || []).forEach(subject => {
      const subjectLabel = this.getSubjectLabel(subject);
      let subSum = 0;
      let subCount = 0;

      (app.state.exams || []).forEach(exam => {
        const examLabel = this.getExamLabel(exam);
        const val = this.getScore(student, subjectLabel, examLabel);
        if (val !== '' && val !== undefined && val !== null && !isNaN(val)) {
          const num = Number(val);
          subSum += num;
          subCount++;
          sum += num;
          count++;
        }
      });

      subAvgs[subjectLabel] = subCount ? (subSum / subCount) : null;
      if (subject?.id) {
        subAvgs[subject.id] = subAvgs[subjectLabel];
      }
    });

    subAvgs.overall = count ? (sum / count) : null;
    return subAvgs;
  },

  calcClassAverages: function () {
    return (app.state.exams || []).map(exam => {
      const examLabel = this.getExamLabel(exam);
      let sum = 0;
      let count = 0;

      (app.state.students || []).forEach(student => {
        const total = this.getTotal(student, examLabel);
        if (total !== null) {
          sum += total;
          count++;
        }
      });

      return {
        id: exam.id,
        name: examLabel,
        overall: count ? (sum / count) : null
      };
    });
  },

  getRiskLevel: function (avgOrStudent) {
    const avg = typeof avgOrStudent === 'number'
      ? avgOrStudent
      : this.getAverage(avgOrStudent, this.getLatestExam());

    if (avg >= 70) return 'safe';
    if (avg >= 50) return 'borderline';
    return 'at-risk';
  },

  groupStudentsByRisk: function () {
    const latestExam = this.getLatestExam();
    const groups = { safe: [], borderline: [], 'at-risk': [] };

    (app.state.students || []).forEach(student => {
      const avg = this.getAverage(student, latestExam);
      const risk = this.getRiskLevel(avg);
      groups[risk].push({
        name: student.name,
        avg: avg.toFixed(1)
      });
    });

    return groups;
  },

  getWeakestSubject: function (student) {
    const avgs = this.calcAverages(student);
    let weakest = null;
    let min = Infinity;
    app.state.subjects.forEach(s => {
      const subjectLabel = this.getSubjectLabel(s);
      if (avgs[subjectLabel] !== null && avgs[subjectLabel] !== undefined && avgs[subjectLabel] < min) {
        min = avgs[subjectLabel];
        weakest = subjectLabel;
      }
    });
    return weakest || '—';
  }
};

app.analytics = analytics;

export default analytics;
