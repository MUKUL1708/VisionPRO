// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC4hxHlQMgzHJVKSMGDj9_4FyL83yLkBYc",
  authDomain: "visionpro-6f827.firebaseapp.com",
  projectId: "visionpro-6f827",
  storageBucket: "visionpro-6f827.firebasestorage.app",
  messagingSenderId: "316077888260",
  appId: "1:316077888260:web:04d00a72eff7c745683651",
  measurementId: "G-13BCR5CH42"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
