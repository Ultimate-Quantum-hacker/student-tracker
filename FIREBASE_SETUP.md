# Firebase Setup Guide

## Overview
This app now uses Firebase Firestore for data storage instead of localStorage. Follow these steps to set up your Firebase project.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "student-tracker")
4. Accept terms and continue
5. Choose your Google Analytics account or skip
6. Click "Create project"

## Step 2: Set Up Firestore Database

1. In your Firebase project, go to "Firestore Database" in the left menu
2. Click "Create database"
3. Choose "Start in test mode" (for now)
4. Select a location (choose closest to your users)
5. Click "Create"

## Step 3: Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Under "Your apps", click the web icon (</>)
4. Enter app name: "Student Tracker"
5. Click "Register app"
6. Copy the firebaseConfig object

## Step 4: Update Firebase Configuration

Open `js/firebase.js` and replace the placeholder config with your actual config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-actual-app-id"
};
```

## Step 5: Update Firestore Rules

For security, update your Firestore rules in the Firebase Console:

1. Go to Firestore Database → Rules
2. Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to authenticated users only
    // For now, allow all access (testing mode)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## Data Structure

The app automatically creates these collections:

### students
```javascript
{
  id: "auto-generated",
  name: "Student Name",
  class: "Class Name (optional)",
  notes: "Optional notes",
  createdAt: "2023-..."
}
```

### exams
```javascript
{
  id: "auto-generated", 
  title: "Mock 1",
  date: "2023-..."
}
```

### subjects
```javascript
{
  id: "auto-generated",
  name: "English Language"
}
```

### scores
```javascript
{
  id: "auto-generated",
  studentId: "student-id",
  examId: "exam-id", 
  subject: "English Language",
  score: 85,
  createdAt: "2023-..."
}
```

## Testing

1. Open `index.html` in a browser
2. Check browser console for "Firebase initialized successfully"
3. Try adding a student - it should save to Firestore
4. Check Firebase Console → Firestore Database to see your data

## Troubleshooting

### "Firebase not defined" error
- Make sure Firebase SDK scripts are loaded before your app scripts
- Check internet connection

### "Permission denied" error
- Update Firestore rules to allow access
- Check if you're using the correct project ID

### Data not saving
- Check browser console for errors
- Verify Firebase configuration is correct
- Make sure Firestore is enabled in your project

## Next Steps

After testing works:
1. Implement proper authentication
2. Restrict Firestore rules for security
3. Set up proper indexes for performance

## Migration from localStorage

If you have existing data in localStorage:
1. The app will automatically migrate when you first load it
2. All existing students, exams, subjects, and scores will be copied to Firestore
3. Your data is now stored in the cloud and accessible from any device
