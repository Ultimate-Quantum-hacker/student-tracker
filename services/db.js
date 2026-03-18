/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — services/db.js
   Database abstraction layer for Firestore operations.
   ═══════════════════════════════════════════════ */

import { db, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, isFirebaseConfigured } from '../js/firebase.js';

// In-memory cache for offline fallback
let cache = {
  students: [],
  exams: [],
  subjects: [],
  scores: []
};

// Error handling wrapper
const handleFirestoreError = (error, operation) => {
  console.error(`Firestore ${operation} error:`, error);
  
  // If Firebase is not configured, use cache-only mode
  if (!isFirebaseConfigured || !db) {
    console.log(`${operation} - using cache-only mode (Firebase not configured)`);
    return; // Don't throw error, just continue with cache
  }
  
  // Return fallback data from cache if available
  throw new Error(`Failed to ${operation}. Using offline cache.`);
};

// STUDENTS OPERATIONS
export const getStudents = async () => {
  try {
    if (!isFirebaseConfigured || !db) {
      console.log('getStudents - using cache-only mode');
      return cache.students;
    }
    
    const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach((doc) => {
      students.push({ id: doc.id, ...doc.data() });
    });
    cache.students = students;
    return students;
  } catch (error) {
    handleFirestoreError(error, 'getStudents');
    return cache.students; // Fallback to cache
  }
};

export const addStudent = async (studentData) => {
  try {
    const studentWithTimestamp = {
      ...studentData,
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'students'), studentWithTimestamp);
    const newStudent = { id: docRef.id, ...studentWithTimestamp };
    cache.students.push(newStudent);
    return newStudent;
  } catch (error) {
    handleFirestoreError(error, 'addStudent');
    // Fallback: add to cache with temporary ID
    const tempStudent = { id: 'temp_' + Date.now(), ...studentData, createdAt: new Date().toISOString() };
    cache.students.push(tempStudent);
    return tempStudent;
  }
};

export const updateStudent = async (studentId, studentData) => {
  try {
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, studentData);
    // Update cache
    const index = cache.students.findIndex(s => s.id === studentId);
    if (index !== -1) {
      cache.students[index] = { ...cache.students[index], ...studentData };
    }
    return { id: studentId, ...studentData };
  } catch (error) {
    handleFirestoreError(error, 'updateStudent');
    // Fallback: update cache
    const index = cache.students.findIndex(s => s.id === studentId);
    if (index !== -1) {
      cache.students[index] = { ...cache.students[index], ...studentData };
    }
    return cache.students[index];
  }
};

export const deleteStudent = async (studentId) => {
  try {
    const studentRef = doc(db, 'students', studentId);
    await deleteDoc(studentRef);
    // Remove from cache
    cache.students = cache.students.filter(s => s.id !== studentId);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'deleteStudent');
    // Fallback: remove from cache
    cache.students = cache.students.filter(s => s.id !== studentId);
    return true;
  }
};

// EXAMS OPERATIONS
export const getExams = async () => {
  try {
    if (!isFirebaseConfigured || !db) {
      console.log('getExams - using cache-only mode');
      return cache.exams;
    }
    
    const q = query(collection(db, 'exams'), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    const exams = [];
    querySnapshot.forEach((doc) => {
      exams.push({ id: doc.id, ...doc.data() });
    });
    cache.exams = exams;
    return exams;
  } catch (error) {
    handleFirestoreError(error, 'getExams');
    return cache.exams; // Fallback to cache
  }
};

export const addExam = async (examData) => {
  try {
    const examWithTimestamp = {
      ...examData,
      date: examData.date || new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'exams'), examWithTimestamp);
    const newExam = { id: docRef.id, ...examWithTimestamp };
    cache.exams.push(newExam);
    return newExam;
  } catch (error) {
    handleFirestoreError(error, 'addExam');
    // Fallback: add to cache with temporary ID
    const tempExam = { id: 'temp_' + Date.now(), ...examData, date: examData.date || new Date().toISOString() };
    cache.exams.push(tempExam);
    return tempExam;
  }
};

export const updateExam = async (examId, examData) => {
  try {
    const examRef = doc(db, 'exams', examId);
    await updateDoc(examRef, examData);
    // Update cache
    const index = cache.exams.findIndex(e => e.id === examId);
    if (index !== -1) {
      cache.exams[index] = { ...cache.exams[index], ...examData };
    }
    return { id: examId, ...examData };
  } catch (error) {
    handleFirestoreError(error, 'updateExam');
    // Fallback: update cache
    const index = cache.exams.findIndex(e => e.id === examId);
    if (index !== -1) {
      cache.exams[index] = { ...cache.exams[index], ...examData };
    }
    return cache.exams[index];
  }
};

export const deleteExam = async (examId) => {
  try {
    const examRef = doc(db, 'exams', examId);
    await deleteDoc(examRef);
    // Remove from cache
    cache.exams = cache.exams.filter(e => e.id !== examId);
    // Also delete related scores
    cache.scores = cache.scores.filter(s => s.examId !== examId);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'deleteExam');
    // Fallback: remove from cache
    cache.exams = cache.exams.filter(e => e.id !== examId);
    cache.scores = cache.scores.filter(s => s.examId !== examId);
    return true;
  }
};

// SUBJECTS OPERATIONS
export const getSubjects = async () => {
  try {
    if (!isFirebaseConfigured || !db) {
      console.log('getSubjects - using cache-only mode');
      return cache.subjects;
    }
    
    const q = query(collection(db, 'subjects'), orderBy('name'));
    const querySnapshot = await getDocs(q);
    const subjects = [];
    querySnapshot.forEach((doc) => {
      subjects.push({ id: doc.id, ...doc.data() });
    });
    cache.subjects = subjects;
    return subjects;
  } catch (error) {
    handleFirestoreError(error, 'getSubjects');
    return cache.subjects; // Fallback to cache
  }
};

export const addSubject = async (subjectData) => {
  try {
    const docRef = await addDoc(collection(db, 'subjects'), subjectData);
    const newSubject = { id: docRef.id, ...subjectData };
    cache.subjects.push(newSubject);
    return newSubject;
  } catch (error) {
    handleFirestoreError(error, 'addSubject');
    // Fallback: add to cache with temporary ID
    const tempSubject = { id: 'temp_' + Date.now(), ...subjectData };
    cache.subjects.push(tempSubject);
    return tempSubject;
  }
};

export const updateSubject = async (subjectId, subjectData) => {
  try {
    const subjectRef = doc(db, 'subjects', subjectId);
    await updateDoc(subjectRef, subjectData);
    // Update cache
    const index = cache.subjects.findIndex(s => s.id === subjectId);
    if (index !== -1) {
      cache.subjects[index] = { ...cache.subjects[index], ...subjectData };
    }
    return { id: subjectId, ...subjectData };
  } catch (error) {
    handleFirestoreError(error, 'updateSubject');
    // Fallback: update cache
    const index = cache.subjects.findIndex(s => s.id === subjectId);
    if (index !== -1) {
      cache.subjects[index] = { ...cache.subjects[index], ...subjectData };
    }
    return cache.subjects[index];
  }
};

export const deleteSubject = async (subjectId) => {
  try {
    const subjectRef = doc(db, 'subjects', subjectId);
    await deleteDoc(subjectRef);
    // Remove from cache
    cache.subjects = cache.subjects.filter(s => s.id !== subjectId);
    // Also delete related scores
    cache.scores = cache.scores.filter(s => s.subjectId !== subjectId);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'deleteSubject');
    // Fallback: remove from cache
    cache.subjects = cache.subjects.filter(s => s.id !== subjectId);
    cache.scores = cache.scores.filter(s => s.subjectId !== subjectId);
    return true;
  }
};

// SCORES OPERATIONS
export const getScores = async (studentId = null, examId = null) => {
  try {
    if (!isFirebaseConfigured || !db) {
      console.log('getScores - using cache-only mode');
      if (!studentId && !examId) {
        return cache.scores;
      }
      return cache.scores.filter(s => 
        (!studentId || s.studentId === studentId) && 
        (!examId || s.examId === examId)
      );
    }
    
    let q = collection(db, 'scores');
    
    if (studentId && examId) {
      q = query(q, where('studentId', '==', studentId), where('examId', '==', examId));
    } else if (studentId) {
      q = query(q, where('studentId', '==', studentId));
    } else if (examId) {
      q = query(q, where('examId', '==', examId));
    }
    
    const querySnapshot = await getDocs(q);
    const scores = [];
    querySnapshot.forEach((doc) => {
      scores.push({ id: doc.id, ...doc.data() });
    });
    
    // Update cache
    if (!studentId && !examId) {
      cache.scores = scores;
    }
    
    return scores;
  } catch (error) {
    handleFirestoreError(error, 'getScores');
    // Fallback to cache
    if (!studentId && !examId) {
      return cache.scores;
    }
    return cache.scores.filter(s => 
      (!studentId || s.studentId === studentId) && 
      (!examId || s.examId === examId)
    );
  }
};

export const saveScore = async (scoreData) => {
  try {
    // Check if score already exists for this student/exam/subject combination
    const existingScores = await getScores(scoreData.studentId, scoreData.examId);
    const existingScore = existingScores.find(s => s.subject === scoreData.subject);
    
    if (existingScore) {
      // Update existing score
      const scoreRef = doc(db, 'scores', existingScore.id);
      await updateDoc(scoreRef, { score: scoreData.score });
      
      // Update cache
      const index = cache.scores.findIndex(s => s.id === existingScore.id);
      if (index !== -1) {
        cache.scores[index] = { ...cache.scores[index], score: scoreData.score };
      }
      
      return { id: existingScore.id, ...existingScore, score: scoreData.score };
    } else {
      // Add new score
      const scoreWithTimestamp = {
        ...scoreData,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'scores'), scoreWithTimestamp);
      const newScore = { id: docRef.id, ...scoreWithTimestamp };
      cache.scores.push(newScore);
      return newScore;
    }
  } catch (error) {
    handleFirestoreError(error, 'saveScore');
    // Fallback: update cache
    const existingScore = cache.scores.find(s => 
      s.studentId === scoreData.studentId && 
      s.examId === scoreData.examId && 
      s.subject === scoreData.subject
    );
    
    if (existingScore) {
      existingScore.score = scoreData.score;
      return existingScore;
    } else {
      const tempScore = { 
        id: 'temp_' + Date.now(), 
        ...scoreData, 
        createdAt: new Date().toISOString() 
      };
      cache.scores.push(tempScore);
      return tempScore;
    }
  }
};

export const deleteScore = async (scoreId) => {
  try {
    const scoreRef = doc(db, 'scores', scoreId);
    await deleteDoc(scoreRef);
    // Remove from cache
    cache.scores = cache.scores.filter(s => s.id !== scoreId);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'deleteScore');
    // Fallback: remove from cache
    cache.scores = cache.scores.filter(s => s.id !== scoreId);
    return true;
  }
};

// UTILITY FUNCTIONS
export const initializeDefaultData = async () => {
  try {
    // If Firebase is not configured, initialize cache with default data
    if (!isFirebaseConfigured || !db) {
      console.log('Initializing default data in cache (Firebase not configured)');
      
      // Add default subjects if cache is empty
      if (cache.subjects.length === 0) {
        const defaultSubjects = [
          { id: 'sub_1', name: 'English Language' },
          { id: 'sub_2', name: 'Mathematics' },
          { id: 'sub_3', name: 'Integrated Science' },
          { id: 'sub_4', name: 'Social Studies' },
          { id: 'sub_5', name: 'Computing' }
        ];
        cache.subjects = defaultSubjects;
        console.log('Added default subjects to cache');
      }
      
      // Add default exam if cache is empty
      if (cache.exams.length === 0) {
        const defaultExam = { id: 'exam_1', title: 'Mock 1', date: new Date().toISOString() };
        cache.exams.push(defaultExam);
        console.log('Added default exam to cache');
      }
      
      return true;
    }
    
    // Firebase is configured - check if subjects exist, if not create defaults
    const subjects = await getSubjects();
    if (subjects.length === 0) {
      const defaultSubjects = [
        { name: 'English Language' },
        { name: 'Mathematics' },
        { name: 'Integrated Science' },
        { name: 'Social Studies' },
        { name: 'Computing' }
      ];
      
      for (const subjectData of defaultSubjects) {
        await addSubject(subjectData);
      }
    }
    
    // Check if exams exist, if not create default
    const exams = await getExams();
    if (exams.length === 0) {
      await addExam({ title: 'Mock 1', date: new Date().toISOString() });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize default data:', error);
    return false;
  }
};

// Export cache for debugging purposes
export const getCache = () => cache;
