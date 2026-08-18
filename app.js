let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;

function init() {
    try {
        // Enforce fallback base styling rules
        const savedTheme = localStorage.getItem('bedside_theme') || 'cyberpunk';
        document.body.className = 'theme-' + savedTheme;
        const selector = document.getElementById('theme-selector');
        if (selector) selector.value = savedTheme;

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error("Supabase library script failed to load. Check supabase.js.");
        }
        if (typeof SUPABASE_URL === 'undefined') throw new Error("config.js credentials could not be loaded.");
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const savedRoom = localStorage.getItem('bedside_active_room');
        const savedUser = localStorage.getItem('bedside_active_user');
        if (savedRoom && savedUser) {
            currentRoomNumber = savedRoom;
            currentUser = JSON.parse(savedUser);
            showChatUi();
        }
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
    const genId = "user_" + room.toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data: prof } = await supabaseClient.from('profiles').select('*').eq('room_number', room).single();
    if (prof) {
        if (prof.password_hash !== pass) return alert("Access Denied: Incorrect password for Room " + room);
        currentUser = { id: prof.id, aud: "authenticated" };
    } else {
        currentUser = { id: genId, aud: "authenticated" };
        await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: room, password_hash: pass, updated_at: new Date() });
    }
    localStorage.setItem('bedside_active_room', room);
    localStorage.setItem('bedside_active_user', JSON.stringify(currentUser));
    currentRoomNumber = room; showChatUi();
}

async function handleSignUp() { handleLogin(); }
function handleLogout() { localStorage.clear(); location.reload(); }

async function saveSettings() {
    const rNum = document.getElementById('room-setup-input').value.trim();
    if (!rNum) return alert('Enter room assignment.');
    
    // Process theme update configuration parameters
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        localStorage.setItem('bedside_theme', themeSelector.value);
        document.body.className = 'theme-' + themeSelector.value;
    }

    const { data: prof } = await supabaseClient.from('profiles').select('password_hash').eq('id', currentUser.id).single();
    await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: rNum, password_hash: prof ? prof.password_hash : "123456", updated_at: new Date() });
    currentRoomNumber = rNum; localStorage.setItem('bedside_active_room', rNum); showChatUi();
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

function selectActiveTargetRoom(selRoom) {
    currentRoomNumber = selRoom; document.getElementById('room-display-tag').innerText = "Room " + selRoom;
    isViewingChatBox = false; toggleViewMode();
}

async function renderWireframeList() {
    const container = document.getElementById('wireframe-dashboard-list'); if (!container) return;
    container.innerHTML = '';
    await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true }).then(async ({ data: profs }) => {
        if (!profs) return;
        for (const p of profs) {
            if (!p.room_number) continue;
            const { data: m } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
            const row = document.createElement('div'); row.className = 'wireframe-row'; row.style.cursor = 'pointer';
            row.onclick = () => selectActiveTargetRoom(p.room_number);
            row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${m && m.length > 0 ? m.message_content : "No message history yet"}</div></div>`;
            container.appendChild(row);
        }
    });
}

// Complete structural safety: Binds initialization ONLY after Document Object Model structures evaluate completely.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
