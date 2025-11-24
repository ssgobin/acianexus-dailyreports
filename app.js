// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    collectionGroup,
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// --- CONFIG DO SEU PROJETO (MESMA DO NEXUS) ---
const firebaseConfig = {
    apiKey: "AIzaSyA7l0LovQnLdv9obeR3YSH6MTdR2d6xcug",
    authDomain: "hubacia-407c1.firebaseapp.com",
    projectId: "hubacia-407c1",
    storageBucket: "hubacia-407c1.appspot.app",
    messagingSenderId: "633355141941",
    appId: "1:633355141941:web:e65270fdabe95da64cc27c",
    measurementId: "G-LN9BEKHCD5"
};

// --- INIT ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// elementos
const fStart = document.getElementById("f-start");
const fEnd = document.getElementById("f-end");
const fUser = document.getElementById("f-user");
const btnLoad = document.getElementById("btn-load");
const btnExport = document.getElementById("btn-export");
const tbody = document.getElementById("tbody");
const summaryEl = document.getElementById("summary");
const statusEl = document.getElementById("status");

const spanAuthUser = document.getElementById("auth-user");
const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");

let lastRows = []; // cache do último resultado para export

// util: msg status
function setStatus(msg, isError = false) {
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#f97373" : "#9ca3af";
}

// util: formatar data YYYY-MM-DD -> dd/mm/aaaa
function formatDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
}

// LOGIN
const ALLOWED_DOMAIN = "acia.com.br";

async function doLogin() {
    const emailRaw = prompt("Seu e-mail @acia.com.br:") || "";
    const pass = prompt("Senha:") || "";
    const email = emailRaw.trim().toLowerCase();

    if (!email || !pass) return;
    if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
        alert("Use um e-mail @" + ALLOWED_DOMAIN);
        return;
    }

    try {
        setStatus("Autenticando...");
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        console.error(e);
        alert("Erro no login: " + (e.message || e.code || e));
        setStatus("Falha ao autenticar.", true);
    }
}

btnLogin.addEventListener("click", doLogin);

btnLogout.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (e) {
        console.error(e);
    }
});

// REACT A MUDANÇA DE AUTH
onAuthStateChanged(auth, (user) => {
    if (user) {
        spanAuthUser.textContent = user.email || "(sem e-mail)";
        btnLogin.style.display = "none";
        btnLogout.style.display = "inline-flex";
        btnLoad.disabled = false;
        setStatus("Conectado.");
    } else {
        spanAuthUser.textContent = "Não conectado";
        btnLogin.style.display = "inline-flex";
        btnLogout.style.display = "none";
        btnLoad.disabled = true;
        btnExport.disabled = true;
        tbody.innerHTML =
            `<tr><td colspan="7" class="muted">Faça login para ver relatórios.</td></tr>`;
        summaryEl.textContent = "Nenhum resultado.";
    }
});

// carrega mapa de usuários (users)
async function loadUsersMap() {
    const snap = await getDocs(collection(db, "users"));
    const map = {};
    const options = [`<option value="__all__">Todos</option>`];

    snap.forEach(doc => {
        const data = doc.data() || {};
        map[doc.id] = {
            uid: doc.id,
            name: data.name || data.displayName || "(sem nome)",
            email: data.email || "",
            role: data.role || ""
        };
        options.push(
            `<option value="${doc.id}">${map[doc.id].name} (${map[doc.id].email || doc.id})</option>`
        );
    });

    // salva o valor atual antes de recriar o select
    const prev = fUser.value;

    // recria as opções
    fUser.innerHTML = options.join("");

    // restaura se ainda existir
    if (prev && [...fUser.options].some(o => o.value === prev)) {
        fUser.value = prev;
    }

    return map;

}

// carrega dailyReports com filtros
async function loadReports() {
    if (!auth.currentUser) {
        setStatus("Faça login para carregar relatórios.", true);
        return;
    }

    try {
        setStatus("Carregando usuários...");
        btnLoad.disabled = true;
        btnExport.disabled = true;
        tbody.innerHTML =
            `<tr><td colspan="7" class="muted">Carregando relatórios…</td></tr>`;

        const userMap = await loadUsersMap();

        setStatus("Carregando relatórios diários...");

        // busca todos os dailyReports (subcoleção de users) ordenados por date desc
        const qRef = query(
            collectionGroup(db, "dailyReports"),
            orderBy("date", "desc")
        );
        const snap = await getDocs(qRef);

        const start = fStart.value || null;
        const end = fEnd.value || null;
        const userFilter = fUser.value || "__all__";

        const rows = [];

        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const date = data.date || "";     // "2025-11-18"
            const createdAt = data.createdAt || "";
            const entries = Array.isArray(data.entries) ? data.entries : [];

            // uid do pai (users/{uid}/dailyReports/{id})
            const userDoc = docSnap.ref.parent.parent;
            const uid = userDoc ? userDoc.id : data.uid || null;

            // filtros por data (strings "YYYY-MM-DD" comparam bem)
            if (start && date < start) return;
            if (end && date > end) return;

            // filtro por usuário
            if (userFilter !== "__all__" && uid !== userFilter) return;

            const user = userMap[uid] || {
                uid,
                name: "(usuário não encontrado)",
                email: ""
            };

            // cada entry do array vira uma linha
            entries.forEach(e => {
                rows.push({
                    uid,
                    userName: user.name,
                    email: user.email,
                    date,
                    createdAt,
                    start: e.start || "",
                    end: e.end || "",
                    period: e.period || "",
                    desc: e.desc || ""
                });
            });
        });

        renderTable(rows);
        lastRows = rows;
        btnExport.disabled = rows.length === 0;

        if (rows.length === 0) {
            setStatus("Nenhum relatório encontrado para os filtros selecionados.");
        } else {
            setStatus(`Carregado com sucesso (${rows.length} linhas).`);
        }
    } catch (e) {
        console.error(e);
        setStatus("Erro ao carregar relatórios: " + (e.message || e), true);
        tbody.innerHTML =
            `<tr><td colspan="7" class="muted">Erro ao carregar dados.</td></tr>`;
    } finally {
        btnLoad.disabled = false;
    }
}

// monta tabela
function renderTable(rows) {
    if (!rows.length) {
        tbody.innerHTML =
            `<tr><td colspan="7" class="muted">Nenhum dado para mostrar.</td></tr>`;
        summaryEl.textContent = "0 linhas.";
        return;
    }

    const html = rows.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.start || ""}</td>
      <td>${r.end || ""}</td>
      <td>${r.period || ""}</td>
      <td>${(r.desc || "").replace(/\n/g, "<br>")}</td>
      <td>${r.userName}</td>
      <td>${r.email}</td>
    </tr>
  `).join("");

    tbody.innerHTML = html;

    const uniqueUsers = new Set(rows.map(r => r.uid)).size;
    summaryEl.textContent =
        `${rows.length} linhas · ${uniqueUsers} usuário(s)`;
}

// exporta CSV
function exportCSV() {
    if (!lastRows.length) return;

    const header = [
        "UID",
        "Nome",
        "Email",
        "Data",
        "Início",
        "Fim",
        "Período",
        "Descrição",
        "createdAt"
    ];

    const lines = [header.join(";")];

    lastRows.forEach(r => {
        const cols = [
            r.uid || "",
            r.userName || "",
            r.email || "",
            r.date || "",
            r.start || "",
            r.end || "",
            r.period || "",
            (r.desc || "").replace(/[\r\n]+/g, " "),
            r.createdAt || ""
        ];

        const escaped = cols.map(c => {
            const s = String(c || "");
            if (/[;"\n]/.test(s)) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        });

        lines.push(escaped.join(";"));
    });

    // BOM UTF-8 para evitar quebra de acentos no Excel
    const BOM = "\uFEFF";

    const blob = new Blob([BOM + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;"
    });


    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `dailyReports-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// eventos
btnLoad.addEventListener("click", () => {
    loadReports();
});

btnExport.addEventListener("click", () => {
    exportCSV();
});

// estado inicial: desabilita carregar até logar
btnLoad.disabled = true;
tbody.innerHTML =
    `<tr><td colspan="7" class="muted">Faça login para ver relatórios.</td></tr>`;
summaryEl.textContent = "Nenhum resultado.";
setStatus("Não conectado.");
