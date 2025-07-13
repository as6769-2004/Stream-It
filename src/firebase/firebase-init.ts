// src/firebase/firebase-init.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCraQviZFsN5DNtATLHS7R4JdqvBH0le_I",
  authDomain: "stream-platform-2025.firebaseapp.com",
  databaseURL: "https://stream-platform-2025-default-rtdb.firebaseio.com",
  projectId: "stream-platform-2025",
  storageBucket: "stream-platform-2025.firebasestorage.app",
  messagingSenderId: "6102817020",
  appId: "1:6102817020:web:3b997f096a2f89d0eadf79",
  measurementId: "G-CYHF9Q68QG"
};

// Only initialize if not already initialized
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
