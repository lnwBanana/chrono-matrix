import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAarR3JBlClBsEosPPIM4Bd-HsxLUbMagk",
  authDomain: "chrono-matrix.firebaseapp.com",
  databaseURL: "https://chrono-matrix-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chrono-matrix",
  storageBucket: "chrono-matrix.firebasestorage.app",
  messagingSenderId: "441977507812",
  appId: "1:441977507812:web:8ba503d3461ba6789341f1",
  measurementId: "G-BK6ZT79B9J",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
