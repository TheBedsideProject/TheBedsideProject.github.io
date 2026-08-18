let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;

function init() {
    try {
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
    const auth = document.getElementById('auth-container');
    const chat = document.getElementById('chat-container');
    const settings = document.getElementById('settings-container');
    const denied = document.getElementById('denied-container');
    const debug = document.getElementById('error-debug-details');
    
    if (auth) auth.style.display = 'none';
    if (chat) chat.style.display = 'none';
    if (settings) settings.style.display = 'none';
    if (denied) denied.style.display = 'block';
    if (debug) debug.innerText = `ERROR LOG:\n${err.stack || err.message || err}`;
}

function dismissAccessDenied() { 
    const denied = document.getElementById('denied-container');
    const auth = document.getElementById('auth-container');
    if (denied) denied.style.display = 'none'; 
    if (auth) auth.style.display = 'block'; 
    init(); 
}

async function handleLogin() {
    if (!supabaseClient) return alert("Initializing connectivity...");
    const roomInput = document.getElementById('auth-room');
    const passInput = document.getElementById('auth-password');
    if (!roomInput || !passInput) return;
    
    const room = roomInput.value.trim();
    const pass = passInput.value;
    if (!room || !pass) return alert('Fill fields completely.');
    
    currentRoomNumber = room;
    currentUser = { id: "user_" + room.toLowerCase().replace(/[^a-z0-9]/g, ''), aud: "authenticated" };
    
    localStorage.setItem('bedside_active_room', currentRoomNumber);
    localStorage.setItem('bedside_active_user', JSON.stringify(currentUser));
    
    await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: currentRoomNumber, updated_at: new Date() });
    showChatUi();
}

async function handleSignUp() {
    handleLogin();
}

function handleLogout() { 
    localStorage.clear();
    location.reload(); 
}

async function saveSettings() {
    const input = document.getElementById('room-setup-input');
    if (!input) return;
    const rNum = input.value.trim();
    if (!rNum) return alert('Enter room assignment.');
    await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: rNum, updated_at: new Date() });
    currentRoomNumber = rNum;
    localStorage.setItem('bedside_active_room', currentRoomNumber);
    showChatUi();
}

async function handleDischarge() {
    if (!confirm("Purge active streams?")) return;
    await supabaseClient.from('messages').delete().eq('sender_name', "Room " + currentRoomNumber);
    await supabaseClient.from('profiles').delete().eq('id', currentUser.id);
    handleLogout();
}

function showSettingsUi() {
    const denied = document.getElementById('denied-container');
    const auth = document.getElementById('auth-container');
    const chat = document.getElementById('chat-container');
    const settings = document.getElementById('settings-container');
    const setupInput = document.getElementById('room-setup-input');
    const cancelBtn = document.getElementById('cancel-settings-btn');
    
    if (denied) denied.style.display = 'none';
    if (auth) auth.style.display = 'none';
    if (chat) chat.style.display = 'none';
    if (settings) settings.style.display = 'block';
    if (setupInput) setupInput.value = currentRoomNumber === "Unknown Room" ? "" : currentRoomNumber;
    if (cancelBtn) cancelBtn.style.display = currentRoomNumber !== "Unknown Room" ? "block" : "none";
}

function showChatUi() {
    const denied = document.getElementById('denied-container');
    const auth = document.getElementById('auth-container');
    const settings = document.getElementById('settings-container');
    const chat = document.getElementById('chat-container');
    const displayTag = document.getElementById('room-display-tag');
    
    if (denied) denied.style.display = 'none';
    if (auth) auth.style.display = 'none';
    if (settings) settings.style.display = 'none';
    if (chat) chat.style.display = 'block';
    if (displayTag) displayTag.innerText = "Room " + currentRoomNumber;
    
    renderWireframeList(); 
    setupRealtimeStream(); 
    fetchMessages();
}

async function fetchMessages() {
    await supabaseClient.from('messages').select('*').eq('room_id', ROOM_ID).order('created_at', { ascending: true }).then(({ data }) => {
        if (data) { 
            const box = document.getElementById('chat-box'); 
            if (box) {
                box.innerHTML = ''; 
                data.forEach(msg => appendMessage(msg)); 
            }
        }
    });
}

function appendMessage(msg) {
    const box = document.getElementById('chat-box'); 
    if (!box) return;
    const isMe = msg.sender_name === "Room " + currentRoomNumber;
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
    wrapper.innerHTML = `<span class="msg-meta">${msg.sender_name} • ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div class="message">${msg.message_content}</div>`;
    box.appendChild(wrapper); 
    box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('message-input'); 
    if (!input || !input.value.trim()) return;
    await supabaseClient.from('messages').insert([{ room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: input.value.trim() }]);
    input.value = ''; 
    fetchMessages();
}

function setupRealtimeStream() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, () => { fetchMessages(); renderWireframeList(); }).subscribe();
}

function toggleViewMode() {
    const lf = document.getElementById('wireframe-dashboard-list');
    const cf = document.getElementById('chat-box-view-wrapper');
    const toggleBtn = document.getElementById('view-toggle-btn');
    
    isViewingChatBox = !isViewingChatBox;
    if (lf) lf.style.display = isViewingChatBox ? 'none' : 'block'; 
    if (cf) cf.style.display = isViewingChatBox ? 'block' : 'none';
    if (toggleBtn) toggleBtn.innerText = isViewingChatBox ? "📋 View Room List" : "💬 Open Chat Box";
    if (!isViewingChatBox) renderWireframeList();
}

function selectActiveTargetRoom(selectedRoom) {
    currentRoomNumber = selectedRoom;
    const displayTag = document.getElementById('room-display-tag');
    if (displayTag) displayTag.innerText = "Room " + currentRoomNumber;
    isViewingChatBox = false;
    toggleViewMode();
}

async function renderWireframeList() {
    const container = document.getElementById('wireframe-dashboard-list'); 
    if (!container) return;
    container.innerHTML = '';
    await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true }).then(async ({ data: profs }) => {
        if (!profs) return;
        for (const p of profs) {
            if (!p.room_number) continue;
            const { data: msg } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
            const txt = (msg && msg.length > 0) ? msg.message_content : "No message history yet";
            const row = document.createElement('div');
            row.className = 'wireframe-row';
            row.style.cursor = 'pointer';
            row.onclick = () => selectActiveTargetRoom(p.room_number);
            row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${txt}</div></div>`;
            container.appendChild(row);
        }
    });
}

// Fixed Timing Layer: This event handler guarantees HTML structures are drawn completely before executing code loops
window.addEventListener('load', init);
