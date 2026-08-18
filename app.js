let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;

function init() {
    try {
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error("Supabase library object constructor not loaded on window layer yet. Check if your project file name matches exactly: 'supabase.js'.");
        }
        if (typeof SUPABASE_URL === 'undefined') throw new Error("config.js credentials could not be loaded.");
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        supabaseClient.auth.getUser().then(({ data }) => { if (data?.user) { currentUser = data.user; loadUserProfile(); } });
    } catch(e) { 
        showAccessDenied(e); 
    }
}

function showAccessDenied(err) {
    document.getElementById('auth-container').style.display = document.getElementById('chat-container').style.display = document.getElementById('settings-container').style.display = 'none';
    document.getElementById('denied-container').style.display = 'block';
    document.getElementById('error-debug-details').innerText = `ERROR LOG:\n${err.stack || err.message || err}`;
}

function dismissAccessDenied() { document.getElementById('denied-container').style.display = 'none'; document.getElementById('auth-container').style.display = 'block'; init(); }

async function handleLogin() {
    if (!supabaseClient) return alert("Initializing connectivity...");
    const room = document.getElementById('auth-room').value.trim(), pass = document.getElementById('auth-password').value;
    if (!room || !pass) return alert('Fill fields completely.');
    const email = `${room.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedside.project`;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) return alert("Login Failed: " + error.message);
    currentUser = data.user; loadUserProfile();
}

async function handleSignUp() {
    if (!supabaseClient) return alert("Initializing connectivity...");
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
    const { data } = await supabaseClient.from('messages').select('*').eq('room_id', ROOM_ID).order('created_at', { ascending: true });
    if (data) { const box = document.getElementById('chat-box'); box.innerHTML = ''; data.forEach(msg => appendMessage(msg)); }
}

function appendMessage(msg) {
    const box = document.getElementById('chat-box'); if (!box) return;
    const isMe = msg.sender_name === "Room " + currentRoomNumber, wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
    wrapper.innerHTML = `<span class="msg-meta">${msg.sender_name} • ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div class="message">${msg.message_content}</div>`;
    box.appendChild(wrapper); box.scrollTop = box.scrollHeight;
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
    const lf = document.getElementById('wireframe-dashboard-list'), cf = document.getElementById('chat-box-view-wrapper'), toggleBtn = document.getElementById('view-toggle-btn');
    isViewingChatBox = !isViewingChatBox;
    lf.style.display = isViewingChatBox ? 'none' : 'block'; cf.style.display = isViewingChatBox ? 'block' : 'none';
    toggleBtn.innerText = isViewingChatBox ? "📋 View Room List" : "💬 Open Chat Box";
    if (!isViewingChatBox) renderWireframeList();
}

async function renderWireframeList() {
    const container = document.getElementById('wireframe-dashboard-list'); if (!container) return;
    container.innerHTML = '';
    const { data: profs } = await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true });
    if (!profs) return;
    for (const p of profs) {
        if (!p.room_number) continue;
        const { data: msg } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
        const txt = (msg && msg.length > 0) ? msg.message_content : "No message history yet", row = document.createElement('div');
        row.className = 'wireframe-row';
        row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${txt}</div></div>`;
        container.appendChild(row);
    }
}

window.addEventListener('load', init);
