import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCbrbZ7SpgqsdVFhe41dPdWr2c0ils92Ag",
  authDomain: "cotton-masry-40e3e.firebaseapp.com",
  projectId: "cotton-masry-40e3e",
  storageBucket: "cotton-masry-40e3e.firebasestorage.app",
  messagingSenderId: "19153153528",
  appId: "1:19153153528:web:07974041fd56413b283a0d",
  measurementId: "G-92M2F5ZX4E"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);