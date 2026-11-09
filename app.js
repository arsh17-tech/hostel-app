// ---------- FIREBASE SETUP ----------
const firebaseConfig = {
  apiKey: "AIzaSyDv0aFIwZb_WX1xl6JRuvKdCtylSaPQvQ8",
  authDomain: "hostel-app-c2656.firebaseapp.com",
  projectId: "hostel-app-c2656",
  storageBucket: "hostel-app-c2656.firebasestorage.app",
  messagingSenderId: "798561030710",
  appId: "1:798561030710:web:215d3c638cda7d42bb3e97",
  measurementId: "G-VBP260F2Y9"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const fs = firebase.firestore();

// ---------- SETTINGS ----------
const MAX_STUDENTS = 90;

// ---------- DATA (live from cloud) ----------
let db = { rooms: [], students: [], payments: [], laundry: [] };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const occupants = room => db.students.filter(s => s.roomId === room.id);
const roomOf = id => db.rooms.find(r => r.id === id);
const studentOf = id => db.students.find(s => s.id === id);

// ---------- LOGIN ----------
$("loginForm").onsubmit = async e => {
  e.preventDefault();
  $("loginMsg").textContent = "";
  try {
    await auth.signInWithEmailAndPassword($("loginEmail").value.trim(), $("loginPass").value);
  } catch (err) {
    $("loginMsg").textContent = "Login failed. Check email and password.";
  }
};
$("logoutBtn").onclick = () => auth.signOut();

let unsubs = [];
auth.onAuthStateChanged(user => {
  $("loginBox").hidden = !!user;
  $("appBox").hidden = !user;
  unsubs.forEach(u => u());
  unsubs = [];
  if (user) {
    ["rooms", "students", "payments", "laundry"].forEach(name => {
      const u = fs.collection(name).onSnapshot(snap => {
        db[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
      });
      unsubs.push(u);
    });
  }
});

// ---------- TABS ----------
document.querySelectorAll("nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll("section").forEach(s => s.hidden = s.id !== btn.dataset.tab);
  };
});

function renderAll() {
  renderRooms();
  renderStudents();
  renderCapacity();
  renderRent();
  renderLaundry();
}

// ---------- ROOMS ----------
$("roomForm").onsubmit = async e => {
  e.preventDefault();
  await fs.collection("rooms").add({
    number: $("roomNo").value.trim(),
    capacity: Number($("roomCap").value),
    ac: $("roomAc").value === "true",
    rent: Number($("roomRent").value)
  });
  e.target.reset();
};

async function deleteRoom(id) {
  if (occupants(roomOf(id)).length) return alert("Room has students. Move them first.");
  await fs.collection("rooms").doc(id).delete();
}

function renderRooms() {
  $("roomList").innerHTML = db.rooms.map(r => {
    const occ = occupants(r).length;
    return `<tr>
      <td>${esc(r.number)}</td>
      <td class="${r.ac ? "ac" : ""}">${r.ac ? "AC" : "Non-AC"}</td>
      <td>${money(r.rent)}</td>
      <td class="${occ >= r.capacity ? "full" : ""}">${occ}/${r.capacity}${occ >= r.capacity ? " (Full)" : ""}</td>
      <td><button class="danger" onclick="deleteRoom('${r.id}')">Delete</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">No rooms yet</td></tr>`;

  const free = db.rooms.filter(r => occupants(r).length < r.capacity);
  $("stRoom").innerHTML = free.length
    ? free.map(r => `<option value="${r.id}">Room ${esc(r.number)} ${r.ac ? "(AC)" : ""} – ${money(r.rent)}/mo</option>`).join("")
    : `<option value="">No free beds</option>`;

  const opts = db.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("rtStudent").innerHTML = opts;
  $("lnStudent").innerHTML = opts;
}

// ---------- CAPACITY ----------
function renderCapacity() {
  const count = db.students.length;
  const left = Math.max(MAX_STUDENTS - count, 0);
  $("stMax").textContent = MAX_STUDENTS;
  $("stCount").textContent = count;
  $("stLeft").textContent = left;
  $("stBar").style.width = Math.min((count / MAX_STUDENTS) * 100, 100) + "%";
  $("stBar").className = count >= MAX_STUDENTS ? "isfull" : (left <= 10 ? "almost" : "");
}

// ---------- STUDENTS ----------
$("studentForm").onsubmit = async e => {
  e.preventDefault();
  if (db.students.length >= MAX_STUDENTS) return alert(`Hostel is full. Maximum ${MAX_STUDENTS} students.`);
  const roomId = $("stRoom").value;
  if (!roomId) return alert("No free room available.");
  const room = roomOf(roomId);
  if (occupants(room).length >= room.capacity) return alert("Room is full.");

  await fs.collection("students").add({
    name: $("stName").value.trim(),
    phone: $("stPhone").value.trim(),
    roomId,
    checkIn: $("stCheckIn").value
  });
  e.target.reset();
  $("stCheckIn").value = today();
};

async function removeStudent(id) {
  if (!confirm("Remove this student and their records?")) return;
  const batch = fs.batch();
  batch.delete(fs.collection("students").doc(id));
  db.payments.filter(p => p.studentId === id).forEach(p => batch.delete(fs.collection("payments").doc(p.id)));
  db.laundry.filter(l => l.studentId === id).forEach(l => batch.delete(fs.collection("laundry").doc(l.id)));
  await batch.commit();
}

function renderStudents() {
  $("studentList").innerHTML = db.students.map(s => {
    const room = roomOf(s.roomId);
    return `<tr>
      <td>${esc(s.name)}</td>
      <td>${esc(s.phone)}</td>
      <td>${room ? esc(room.number) : "-"}</td>
      <td>${s.checkIn}</td>
      <td><button class="danger" onclick="removeStudent('${s.id}')">Remove</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">No students yet</td></tr>`;
}

// ---------- RENT ----------
$("rentForm").onsubmit = async e => {
  e.preventDefault();
  await fs.collection("payments").add({
    studentId: $("rtStudent").value,
    month: $("rtMonth").value,
    amount: Number($("rtAmount").value),
    date: today()
  });
  e.target.reset();
};

function renderRent() {
  const month = thisMonth();
  $("rentList").innerHTML = db.students.map(s => {
    const room = roomOf(s.roomId);
    const rent = room ? room.rent : 0;
    const paid = db.payments
      .filter(p => p.studentId === s.id && p.month === month)
      .reduce((sum, p) => sum + p.amount, 0);
    const due = Math.max(rent - paid, 0);
    const status = due === 0 ? `<span class="paid">Paid</span>` : `<span class="due">Pending</span>`;
    return `<tr>
      <td>${esc(s.name)}</td>
      <td>${room ? esc(room.number) : "-"}</td>
      <td>${money(rent)}</td>
      <td>${money(paid)}</td>
      <td>${money(due)}</td>
      <td>${status}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">No students yet</td></tr>`;
}

// ---------- LAUNDRY ----------
$("laundryForm").onsubmit = async e => {
  e.preventDefault();
  await fs.collection("laundry").add({
    studentId: $("lnStudent").value,
    date: $("lnDate").value,
    items: Number($("lnItems").value),
    price: Number($("lnPrice").value),
    status: $("lnStatus").value
  });
  e.target.reset();
  $("lnPrice").value = 10;
};

async function setLaundryStatus(id, status) {
  await fs.collection("laundry").doc(id).update({ status });
}

async function deleteLaundry(id) {
  await fs.collection("laundry").doc(id).delete();
}

function renderLaundry() {
  $("laundryList").innerHTML = db.laundry
    .slice().sort((a, b) => (b.date > a.date ? 1 : -1))
    .map(l => {
      const s = studentOf(l.studentId);
      return `<tr>
        <td>${l.date}</td>
        <td>${s ? esc(s.name) : "-"}</td>
        <td>${l.items}</td>
        <td>${money(l.items * l.price)}</td>
        <td>
          <select onchange="setLaundryStatus('${l.id}', this.value)">
            ${["Pending", "Washing", "Delivered"].map(st =>
              `<option ${st === l.status ? "selected" : ""}>${st}</option>`).join("")}
          </select>
        </td>
        <td><button class="danger" onclick="deleteLaundry('${l.id}')">Delete</button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="6">No laundry entries</td></tr>`;
}

// ---------- START ----------
$("lnDate").value = today();
$("rtMonth").value = thisMonth();
$("stCheckIn").value = today();