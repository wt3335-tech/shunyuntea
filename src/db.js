import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBR7f5SZzFKKfTuHUYHkWdJJWT4sBmNwuE",
  authDomain: "fushoushan-tea.firebaseapp.com",
  projectId: "fushoushan-tea",
  storageBucket: "fushoushan-tea.firebasestorage.app",
  messagingSenderId: "345028316055",
  appId: "1:345028316055:web:91011a23d738c7390cd2d2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const DOC_REF = doc(db, "teaapp", "data");

export async function dbLoad() {
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists()) return JSON.parse(snap.data().payload);
    return null;
  } catch(e) { console.error("dbLoad:", e); return null; }
}

export async function dbSave(data) {
  try {
    await setDoc(DOC_REF, { payload: JSON.stringify(data) });
  } catch(e) { console.error("dbSave:", e); }
}
