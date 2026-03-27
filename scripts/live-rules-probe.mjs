const PROJECT_ID = 'student-tracker-app-670c2';
const API_KEY = 'AIzaSyA4h1LqXXonwfYR4mu4E_8bAXD8T7cw_Vk';

const nowIso = () => new Date().toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toFirestoreValue(entry))
      }
    };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: toFirestoreFields(value)
      }
    };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
};

const toFirestoreFields = (data) => {
  return Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = toFirestoreValue(value);
    return acc;
  }, {});
};

const signUpTeacher = async (email, password) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`signUp failed: ${JSON.stringify(payload)}`);
  }

  return {
    uid: payload.localId,
    idToken: payload.idToken,
    email: payload.email
  };
};

const commitWrite = async (idToken, docPath, data) => {
  const name = `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name,
              fields: toFirestoreFields(data)
            }
          }
        ]
      })
    }
  );

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload
  };
};

const listCollection = async (idToken, collectionPath) => {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}?pageSize=1`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    }
  );

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload
  };
};

const summarizeError = (result) => {
  return String(result?.payload?.error?.message || result?.payload?.error?.status || '').toLowerCase();
};

const run = async () => {
  const suffix = `${Date.now()}-${rand()}`;
  const email = `rules.teacher.${suffix}@example.com`;
  const password = 'Passw0rd!23456';

  const auth = await signUpTeacher(email, password);
  const uid = auth.uid;

  const classId = `rules_class_${rand()}`;
  const classDocPath = `users/${uid}/classes/${classId}`;
  const validStudentPath = `${classDocPath}/students/student_valid_${rand()}`;
  const invalidStudentPath = `${classDocPath}/students/student_invalid_${rand()}`;
  const legacyStudentPath = `users/${uid}/students/student_legacy_${rand()}`;
  const userDocPath = `users/${uid}`;

  const profileCreate = await commitWrite(auth.idToken, userDocPath, {
    uid,
    email: auth.email,
    name: 'Rules Probe Teacher',
    role: 'teacher',
    updatedAt: nowIso()
  });

  const classCreate = await commitWrite(auth.idToken, classDocPath, {
    id: classId,
    name: 'Rules Probe Class',
    ownerId: uid,
    ownerName: 'Rules Probe Teacher',
    userId: uid
  });

  const validScopedWrite = await commitWrite(auth.idToken, validStudentPath, {
    id: `student_valid_${rand()}`,
    name: 'Valid Student',
    classId,
    ownerId: uid,
    userId: uid
  });

  const invalidChildWrite = await commitWrite(auth.idToken, invalidStudentPath, {
    id: `student_invalid_${rand()}`,
    name: 'Invalid Student Missing Scope',
    userId: uid
  });

  const legacyRootWrite = await commitWrite(auth.idToken, legacyStudentPath, {
    id: `student_legacy_${rand()}`,
    name: 'Legacy Write Attempt',
    classId,
    ownerId: uid,
    userId: uid
  });

  const teacherRolePatch = await commitWrite(auth.idToken, userDocPath, {
    uid,
    email: auth.email,
    name: 'Rules Probe Teacher',
    role: 'admin',
    updatedAt: nowIso()
  });

  const legacyCollectionRead = await listCollection(auth.idToken, `users/${uid}/students`);

  const checks = [
    {
      name: 'teacher profile create succeeds',
      pass: profileCreate.ok,
      status: profileCreate.status,
      detail: profileCreate.ok ? 'ok' : summarizeError(profileCreate)
    },
    {
      name: 'teacher class create succeeds',
      pass: classCreate.ok,
      status: classCreate.status,
      detail: classCreate.ok ? 'ok' : summarizeError(classCreate)
    },
    {
      name: 'teacher valid scoped write succeeds',
      pass: validScopedWrite.ok,
      status: validScopedWrite.status,
      detail: validScopedWrite.ok ? 'ok' : summarizeError(validScopedWrite)
    },
    {
      name: 'invalid child doc missing classId/ownerId denied',
      pass: !invalidChildWrite.ok && invalidChildWrite.status === 403,
      status: invalidChildWrite.status,
      detail: summarizeError(invalidChildWrite)
    },
    {
      name: 'legacy root write denied',
      pass: !legacyRootWrite.ok && legacyRootWrite.status === 403,
      status: legacyRootWrite.status,
      detail: summarizeError(legacyRootWrite)
    },
    {
      name: 'teacher cannot patch own role to admin',
      pass: !teacherRolePatch.ok && teacherRolePatch.status === 403,
      status: teacherRolePatch.status,
      detail: summarizeError(teacherRolePatch)
    },
    {
      name: 'migration-safe legacy reads still allowed',
      pass: legacyCollectionRead.ok,
      status: legacyCollectionRead.status,
      detail: legacyCollectionRead.ok ? 'ok' : summarizeError(legacyCollectionRead)
    }
  ];

  const failed = checks.filter((check) => !check.pass);

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    probeEmail: email,
    uid,
    checks,
    passCount: checks.length - failed.length,
    failCount: failed.length
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('live-rules-probe failure:', error);
  process.exitCode = 1;
});
