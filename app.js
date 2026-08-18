window.supabase = {
    createClient: (u, k) => {
        const h = { "apikey": k, "Authorization": "Bearer " + k, "Content-Type": "application/json" };
        const req = async (p, m, b) => {
            try {
                const r = await fetch(u + p, { method: m, headers: h, body: b ? JSON.stringify(b) : null });
                return { data: r.ok && m !== "DELETE" ? await r.json() : null, error: r.ok ? null : { message: "API Error" } };
            } catch(e) { return { data: null, error: e }; }
        };
        return {
            auth: {
                signUp: async (c) => req("/auth/v1/signup", "POST", { email: c.email, password: c.password }),
                signInWithPassword: async (c) => {
                    const r = await req("/auth/v1/token?grant_type=password", "POST", { email: c.email, password: c.password });
                    return r.data?.user ? { data: { user: r.data.user } } : { error: { message: "Auth Error" } };
                },
                signOut: async () => ({}), getUser: async () => ({ data: { user: currentUser } })
            },
            from: (t) => ({
                select: (q) => ({
                    eq: (col, val) => ({
                        single: async () => {
                            const res = await req(`/rest/v1/${t}?${col}=eq.${val}`, "GET");
                            return { data: (res.data && res.data.length > 0) ? res.data[0] : null };
                        },
                        order: (ob, s) => ({
                            limit: async (l) => ({ data: (await req(`/rest/v1/${t}?sender_name=eq.${val}&order=${ob}.desc&limit=${l}`, "GET")).data || [] }),
                            then: async (cb) => cb({ data: (await req(`/rest/v1/${t}?room_id=eq.${val}&order=${ob}.asc`, "GET")).data || [] })
                        })
                    })
                }),
                upsert: async (p) => req(`/rest/v1/${t}`, "POST", p),
                delete: () => ({ eq: (col, val) => ({ then: async (cb) => cb(await req(`/rest/v1/${t}?${col}=eq.${val}`, "DELETE")) }) })
            }), channel: () => ({ on: () => ({ subscribe: () => {} }) })
        };
    }
};
let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;
function init() {
    try {
        if (typeof SUPABASE_URL === 'undefined') throw new Error("config.js connection keys are unassigned.");
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        supabaseClient.auth.getUser().then(({ data }) => { if (data?.user) { currentUser = data.user; loadUserProfile(); } });
    } catch(e) { showAccessDenied(e); }
}
function showAccessDenied(err) {
    document.getElementById('auth-container').style.display = document.getElementById('chat-container').style.display = document.getElementById('settings-container').style.display = 'none';
    document.getElementById('denied-container').style.display = 'block';
    document.getElementById('error-debug-details').innerText = `ERROR LOG:\n${err.message || err}`;
}
function dismissAccessDenied() { document.getElementById('denied-container').style.display = 'none'; document.getElementById('auth-container').style.display = 'block'; init(); }
async function handleLogin() {
    const room = document.getElementById('auth-room').value.trim(), pass = document.getElementById('auth-password').value;
    if (!room || !pass) return alert('Fill fields completely.');
    const email = `${room.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedside.project`;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) return alert("Login Failed: " + error.message);
    currentUser = data.user; loadUserProfile();
}
async function handleSignUp() {
    const room = document.getElementById('auth-room').value.trim(), pass = document.getElementById('auth-password').value;
    if (!room || !pass) return alert('Fill fields completely.');
    const email = `${room.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedside.project`;
    const { error } = await supabaseClient.auth.signUp({ email, password: pass });
    if (error) return alert("Registration Failed: " + error.message);
    alert('Signature Initialized! Logging in...'); handleLogin();
}
function handleLogout() { location.reload(); }
async function loadUserProfile() {
    const { data } = await supabaseClient.from('profiles').select('room_number').eq('id', currentUser.id).single();
    if (data?.room_number) { currentRoomNumber = data.room_number; showChatUi(); } else { showSettingsUi(); }
}
async function saveSettings() {
    const rNum = document.getElementById('room-setup-input').value.trim();
    if (!rNum) return alert('Enter room assignment.');
    await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: rNum, updated_at: new Date() });
    currentRoomNumber = rNum; showChatUi();
}
async function handleDischarge() {
    if (!confirm("Purge active streams?")) return;
    await supabaseClient.from('messages').delete().eq('sender_name', "Room " + currentRoomNumber);
    await supabaseClient.from('profiles').delete().eq('id', currentUser.id);
    handleLogout();
}
function showSettingsUi() {
    document.getElementById('denied-container').style.display = document.getElementById('auth-container').style.display = document.getElementById('chat-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'block';
    document.getElementById('room-setup-input').value = currentRoomNumber === "Unknown Room" ? "" : currentRoomNumber;
    document.getElementById('cancel-settings-btn').style.display = currentRoomNumber !== "Unknown Room" ? "block" : "none";
}
function showChatUi() {
    document.getElementById('denied-container').style.display = document.getElementById('auth-container').style.display = document.getElementById('settings-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'block';
    document.getElementById('room-display-tag').innerText = "Room " + currentRoomNumber;
    renderWireframeList(); setupRealtimeStream(); fetchMessages();
}
async function fetchMessages() {
    await supabaseClient.from('messages').select('*').eq('room_id', ROOM_ID).order('created_at', { ascending: true }).then(({ data }) => {
        if (data) { const box = document.getElementById('chat-box'); box.innerHTML = ''; data.forEach(msg => appendMessage(msg)); }
    });
}
function appendMessage(msg) {
    const box = document.getElementById('chat-box'); if (!box) return;
    const isMe = msg.sender_name === "Room " + currentRoomNumber, w = document.createElement('div');
    w.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
    w.innerHTML = `<span class="msg-meta">${msg.sender_name} • ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div class="message">${msg.message_content}</div>`;
    box.appendChild(w); box.scrollTop = box.scrollHeight;
}
async function sendMessage() {
    const input = document.getElementById('message-input'); if (!input || !input.value.trim()) return;
    await supabaseClient.from('messages').insert([{ room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: input.value.trim() }]);
    input.value = ''; fetchMessages();
}
function setupRealtimeStream() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, () => { fetchMessages(); renderWireframeList(); }).subscribe();
}
function toggleViewMode() {
    const lf = document.getElementById('wireframe-dashboard-list'), cf = document.getElementById('chat-box-view-wrapper'), btn = document.getElementById('view-toggle-btn');
    isViewingChatBox = !isViewingChatBox;
    lf.style.display = isViewingChatBox ? 'none' : 'block'; cf.style.display = isViewingChatBox ? 'block' : 'none';
    btn.innerText = isViewingChatBox ? "📋 View Room List" : "💬 Open Chat Box";
    if (!isViewingChatBox) renderWireframeList();
}
async function renderWireframeList() {
    const container = document.getElementById('wireframe-dashboard-list'); if (!container) return;
    container.innerHTML = '';
    await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true }).then(async ({ data: profs }) => {
        if (!profs) return;
        for (const p of profs) {
            if (!p.room_number) continue;
            const { data: msg } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
            const txt = (msg && msg.length > 0) ? msg.message_content : "No message history yet", row = document.createElement('div');
            row.className = 'wireframe-row';
            row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${txt}</div></div>`;
            container.appendChild(row);
        }
    });
}
window.addEventListener('load', init);
