import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBgFOxLq9hp9zxzcXzOt6jWdef8_bfz7DI",
  authDomain: "erlc-website-19558.firebaseapp.com",
  projectId: "erlc-website-19558",
  storageBucket: "erlc-website-19558.firebasestorage.app",
  messagingSenderId: "260232580462",
  appId: "1:260232580462:web:fa08150c6c1a515fd5857f",
  measurementId: "G-LGFSJXWRP9"
};

// Main Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Secondary App for Owner to create staff without logging out
export const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
