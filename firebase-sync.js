// Chronos Phase 2 — Firebase Authentication + Firestore Sync
// LocalStorage stays the primary data store. Firebase is the cloud backup/sync layer.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlk5DcQPuIaGqzmgBfOz_8aqGwPO5HT7A",
  authDomain: "chronos-time-7193.firebaseapp.com",
  projectId: "chronos-time-7193",
  storageBucket: "chronos-time-7193.firebasestorage.app",
  messagingSenderId: "394250438974",
  appId: "1:394250438974:web:b2e8036f87cd5609f2846f"
};

const EVENTS_KEY = "chronos_events_v1";
const MILESTONES_KEY = "chronos_milestones_v1";
const DELETIONS_KEY = "chronos_deleted_v1";
const authBtn = document.getElementById("authBtn");
const syncBtn = document.getElementById("syncBtn");
const statusEl = document.getElementById("syncStatus");
const dot = document.getElementById("syncDot");
const accountEl = document.getElementById("accountLabel");
let auth, db, user = null, syncing = false, firstSync = true, syncPaused = false;

function status(label, state = "offline") {
  if (statusEl) statusEl.textContent = label;
  if (dot) dot.className = `sync-dot ${state}`;
}
function readLocal(key) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function localBundle() {
  return { events: readLocal(EVENTS_KEY), milestones: readLocal(MILESTONES_KEY), deleted: readLocal(DELETIONS_KEY) };
}
function docRef() { return doc(db, "users", user.uid, "chronos", "data"); }
function stampRecords(items) {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).map(item => ({ ...item, updatedAt: Number(item.updatedAt) || now }));
}
function stampDeletes(items) {
  const now = Date.now();
  return uniqueDeletes((Array.isArray(items) ? items : []).map(item => ({ ...item, deletedAt: Number(item.deletedAt) || now })));
}
function deleteKey(item) { return `${item.type || "legacy"}:${item.id}`; }
function uniqueDeletes(items) {
  const map = new Map();
  for (const item of (Array.isArray(items) ? items : [])) {
    if (!item?.id) continue;
    const key = deleteKey(item), old = map.get(key);
    if (!old || (Number(item.deletedAt) || 0) > (Number(old.deletedAt) || 0) map.set(key, item);
  }
  return [...map.values()];
}
function mergeRecords(local, cloud, deletions, type) {
  const map = new Map();
  // Cloud first; local wins a timestamp tie, which helps old Phase 1 records with no timestamp.
  for (const item of [...(Array.isArray(cloud) ? cloud : []), ...(Array.isArray(local) ? local : [])]) {
    if (!item?.id) continue;
    const previous = map.get(item.id);
    if (!previous || (Number(item.updatedAt) || 0) >= (Number(previous.updatedAt) || 0)) map.set(item.id, item);
  }
  const tombstones = (deletions || []).filter(item => item.type === type || !item.type);
  for (const tombstone of tombstones) {
    const current = map.get(tombstone.id);
    if (!current || (Number(tombstone.deletedAt) || 0) >= (Number(current.updatedAt) || 0) map.delete(tombstone.id);
  }
  return [...map.values()];
}
function saveBundle(bundle) {
  writeLocal(EVENTS_KEY, bundle.events || []);
  writeLocal(MILESTONES_KEY, bundle.milestones || []);
  writeLocal(DELETIONS_KEY, bundle.deleted || []);
  window.dispatchEvent(new CustomEvent("chronos:data-updated"));
}
function conflictChoice() {
  return new Promise(resolve => {
    const overlay = document.getElementById("cloudConflict");
    if (!overlay) { resolve("cancel"); return; }
    overlay.classList.add("show");
    const finish = choice => {
      overlay.classList.remove("show");
      overlay.querySelectorAll("[data-cloud-choice]").forEach(button => button.onclick = null);
      resolve(choice);
    };
    overlay.querySelectorAll("[data-cloud-choice]").forEach(button => { button.onclick = () => finish(button.dataset.cloudChoice); });
  });
}
function cloudPayload(bundle) {
  return {
    events: stampRecords(bundle.events),
    milestones: stampRecords(bundle.milestones),
    deleted: stampDeletes(bundle.deleted),
    updatedAt: Date.now(),
    schema: 2
  };
}
async function syncNow({ initial = false, manual = false } = {}) {
  if (!user || !db || syncing || !navigator.onLine) {
    if (!navigator.onLine) status("Offline · changes saved locally", "offline");
    return;
  }
  if (syncPaused && !manual) return;
  if (manual) syncPaused = false;
  syncing = true;
  status("Syncing…", "syncing");
  let canceled = false;
  try {
    const ref = docRef();
    const snapshot = await getDoc(ref);
    const cloud = snapshot.exists() ? snapshot.data() : null;
    const local = localBundle();
    if (!cloud) {
      const payload = cloudPayload(local);
      saveBundle(payload);
      await setDoc(ref, payload);
      status("Cloud backup created", "synced");
      firstSync = false;
      return;
    }
    const localCount = local.events.length + local.milestones.length;
    const cloudCount = (cloud.events || []).length + (cloud.milestones || []).length;
    if ((initial || manual) && firstSync && localCount && cloudCount) {
      const choice = await conflictChoice();
      if (choice === "cancel") {
        canceled = true;
        syncPaused = true;
        status("Sync paused · choose Sync now to retry", "offline");
        return;
      }
      if (choice === "local") {
        const payload = cloudPayload(local);
        saveBundle(payload);
        await setDoc(ref, payload);
        status("This device uploaded to cloud", "synced");
        firstSync = false;
        return;
      }
      if (choice === "cloud") {
        const restored = { events: cloud.events || [], milestones: cloud.milestones || [], deleted: cloud.deleted || [] };
        saveBundle(restored);
        status("Cloud restored to this device", "synced");
        firstSync = false;
        return;
      }
      // Merge both sources by ID/timestamp below.
    }
    const deletions = stampDeletes([...(local.deleted || []), ...(cloud.deleted || [])]);
    const merged = {
      events: mergeRecords(local.events, cloud.events, deletions, "event"),
      milestones: mergeRecords(local.milestones, cloud.milestones, deletions, "milestone"),
      deleted: deletions
    };
    const payload = cloudPayload(merged);
    saveBundle(payload);
    await setDoc(ref, payload);
    status("Synced", "synced");
    firstSync = false;
  } catch (error) {
    console.error("Chronos cloud sync error", error);
    status(navigator.onLine ? "Sync failed · try Sync now" : "Offline · changes saved locally", navigator.onLine ? "error" : "offline");
  } finally {
    syncing = false;
    if (!canceled && !syncPaused) firstSync = false;
  }
}
function markDeleted(type, id) {
  if (!id) return;
  const current = readLocal(DELETIONS_KEY);
  current.push({ type, id, deletedAt: Date.now() });
  writeLocal(DELETIONS_KEY, uniqueDeletes(current));
}
window.ChronosCloud = { sync: () => syncNow({ initial: true, manual: true }), markDeleted };

try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  enableIndexedDbPersistence(db).catch(error => {
    if (error.code !== "failed-precondition" && error.code !== "unimplemented") console.warn("Firestore offline persistence:", error);
  });
  authBtn.onclick = async () => {
    if (user) {
      try { await signOut(auth); }
      catch (error) { console.error(error); status("Sign out failed", "error"); }
    } else {
      try { await signInWithPopup(auth, new GoogleAuthProvider()); }
      catch (error) {
        console.error("Google sign-in error", error);
        status(error.code === "auth/popup-closed-by-user" ? "Login cancelled" : "Login failed · check Firebase setup", "error");
      }
    }
  };
  syncBtn.onclick = () => syncNow({ initial: true, manual: true });
  onAuthStateChanged(auth, async nextUser => {
    user = nextUser;
    syncBtn.hidden = !user;
    if (user) {
      authBtn.textContent = "Sign out";
      accountEl.textContent = user.displayName || user.email || "Signed in";
      status("Signed in · checking cloud…", "syncing");
      firstSync = true;
      syncPaused = false;
      await syncNow({ initial: true });
    } else {
      authBtn.textContent = "Sign in with Google";
      accountEl.textContent = "";
      status(navigator.onLine ? "Local data · not signed in" : "Offline · local data saved", "offline");
    }
  });
} catch (error) {
  console.error("Firebase initialization failed", error);
  status("Firebase unavailable · local data only", "error");
  authBtn.textContent = "Firebase unavailable";
  authBtn.disabled = true;
  syncBtn.hidden = true;
}
window.addEventListener("chronos:data-updated", () => { if (user && navigator.onLine && !syncPaused) syncNow(); });
window.addEventListener("online", () => { status(user ? "Online · syncing" : "Online · local only", user ? "syncing" : "offline"); if (user && !syncPaused) syncNow(); });
window.addEventListener("offline", () => status("Offline · changes saved locally", "offline"));
