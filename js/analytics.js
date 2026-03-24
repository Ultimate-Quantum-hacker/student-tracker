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

  getPerformanceCategories: function () {
    return [
      { key: 'strong', label: 'Strong', min: 80, max: 100 },
      { key: 'good', label: 'Good', min: 70, max: 79 },
      { key: 'average', label: 'Average', min: 60, max: 69 },
      { key: 'borderline', label: 'Borderline', min: 41, max: 59 },
      { key: 'at-risk', label: 'At Risk', min: 0, max: 40 }
    ];
  },

  getLatestExam: function () {
    const exams = app.state.exams || [];
    if (!exams.length) return null;
    return exams[exams.length - 1];
  },

  getPreviousExam: function () {
    const exams = app.state.exams || [];
    if (exams.length < 2) return null;
    return exams[exams.length - 2];
  },

  getLastTwoExams: function () {
    const exams = app.state.exams || [];
    return {
      previousExam: exams.length >= 2 ? exams[exams.length - 2] : null,
      latestExam: exams.length ? exams[exams.length - 1] : null
    };
  },

  getLatestExamLabel: function () {
    return this.getExamLabel(this.getLatestExam());
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

    const examLabel = this.getExamLabel(exam) || this.getLatestExamLabel();
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
    return this.getStudentAverageForExam(student, exam);
  },

  getStudentAverageForExam: function (student, exam) {
    const examLabel = this.getExamLabel(exam);
    if (!examLabel) return null;

    let total = 0;
    let count = 0;

    (app.state.subjects || []).forEach(subject => {
      const score = this.getScore(student, subject, examLabel);
      if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
        total += Number(score);
        count++;
      }
    });

    return count ? total / count : null;
  },

  getStudentOverallAverage: function (student) {
    let total = 0;
    let count = 0;

    (app.state.subjects || []).forEach(subject => {
      const subjectLabel = this.getSubjectLabel(subject);
      (app.state.exams || []).forEach(exam => {
        const examLabel = this.getExamLabel(exam);
        const value = this.getScore(student, subjectLabel, examLabel);
        if (value !== '' && value !== undefined && value !== null && !isNaN(value)) {
          total += Number(value);
          count++;
        }
      });
    });

    return count ? total / count : null;
  },

  getStudentStatusDetails: function (student, exam) {
    const latestExam = exam || this.getLatestExam();
    const examLabel = this.getExamLabel(latestExam);
    const subjects = app.state.subjects || [];

    if (!student || !examLabel || !subjects.length) {
      return { status: 'no-data', average: null, complete: false, scoredCount: 0, expectedCount: subjects.length };
    }

    let total = 0;
    let scoredCount = 0;
    subjects.forEach(subject => {
      const score = this.getScore(student, subject, examLabel);
      if (score !== '' && score !== undefined && score !== null && !isNaN(score)) {
        total += Number(score);
        scoredCount++;
      }
    });

    if (scoredCount === 0) {
      return { status: 'no-data', average: null, complete: false, scoredCount, expectedCount: subjects.length };
    }

    const average = total / scoredCount;
    const complete = scoredCount === subjects.length;
    if (!complete) {
      return { status: 'incomplete', average, complete: false, scoredCount, expectedCount: subjects.length };
    }

    const categories = this.getPerformanceCategories();
    for (const category of categories) {
      if (average >= category.min && average <= category.max) {
        return { status: category.key, average, complete: true, scoredCount, expectedCount: subjects.length };
      }
    }
    return { status: 'at-risk', average, complete: true, scoredCount, expectedCount: subjects.length };
  },

  getStudentStatus: function (student, exam) {
    return this.getStudentStatusDetails(student, exam).status;
  },

  getImprovement: function (student, fromExam, toExam) {
    const from = this.getTotal(student, fromExam);
    const to = this.getTotal(student, toExam);

    if (from === null || to === null || from === 0) return null;
    return ((to - from) / from) * 100;
  },

  calcAverages: function (student) {
    const subAvgs = {};

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
        }
      });

      subAvgs[subjectLabel] = subCount ? (subSum / subCount) : null;
      if (subject?.id) {
        subAvgs[subject.id] = subAvgs[subjectLabel];
      }
    });

    subAvgs.overall = this.getStudentOverallAverage(student);
    return subAvgs;
  },

  calcClassAverages: function (examsInput) {
    const exams = Array.isArray(examsInput) ? examsInput : (app.state.exams || []);
    return exams.map(exam => {
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
    if (typeof avgOrStudent === 'number') {
      const avg = avgOrStudent;
      if (avg === null || avg === undefined || isNaN(avg)) return 'no-data';
      if (avg <= 40) return 'at-risk';
      if (avg <= 59) return 'borderline';
      return 'safe';
    }

    const status = this.getStudentStatus(avgOrStudent);
    if (status === 'at-risk') return 'at-risk';
    if (status === 'borderline') return 'borderline';
    if (status === 'strong' || status === 'good' || status === 'average') return 'safe';
    return 'no-data';
  },

  groupStudentsByStatus: function (exam) {
    const latestExam = exam || this.getLatestExam();
    const latestExamLabel = this.getExamLabel(latestExam);
    const groups = this.getPerformanceCategories().reduce((acc, category) => {
      acc[category.key] = [];
      return acc;
    }, { 'no-data': [], incomplete: [] });

    (app.state.students || []).forEach(student => {
      const details = this.getStudentStatusDetails(student, latestExam);
      const target = groups[details.status] ? details.status : 'no-data';
      groups[target].push({
        id: student.id,
        name: student.name,
        average: details.average,
        complete: details.complete,
        scoredCount: details.scoredCount,
        expectedCount: details.expectedCount
      });
    });

    return { groups, latestExam: latestExamLabel };
  },

  groupStudentsByRisk: function (exam) {
    const latestExam = exam || this.getLatestExam();
    const groups = { safe: [], borderline: [], 'at-risk': [] };

    (app.state.students || []).forEach(student => {
      const details = this.getStudentStatusDetails(student, latestExam);
      const risk = this.getRiskLevel(details.average);
      if (!groups[risk]) return;
      groups[risk].push({
        name: student.name,
        avg: details.average !== null ? details.average.toFixed(1) : 'N/A'
      });
    });

    return {
      groups,
      latestExam: this.getExamLabel(latestExam)
    };
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
