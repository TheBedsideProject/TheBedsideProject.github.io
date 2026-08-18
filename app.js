let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;

function initSupabase() {
    try {
        if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
            throw new Error("config.js missing keys or loaded out of order");
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error("Supabase library not found globally on window object.");
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        checkCurrentUser();
    } catch (e) { 
        showAccessDenied(e); 
    }
}

function showAccessDenied(err) {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'none';
    const deniedBox = document.getElementById('denied-container');
    deniedBox.style.display = 'block';
    let debugBox = document.getElementById('error-debug-details');
    if (!debugBox) {
        debugBox = document.createElement('pre');
        debugBox.id = 'error-debug-details';
        debugBox.style = 'margin:15px 0;padding:10px;background:#000;color:#ff4d4d;font-size:11px;text-align:left;border:2px solid red;white-space:pre-wrap;';
        deniedBox.appendChild(debugBox);
    }
    debugBox.innerText = `ERROR LOG:\n${err.stack || err.message || err}`;
}

function dismissAccessDenied() {
    document.getElementById('denied-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'block';
}

async function handleSignUp() {
    if (!supabaseClient) return alert("Initializing...");
    const room = document.getElementById('auth-room').value.trim(), password = document.getElementById('auth-password').value;
    if (!room || !password) return alert('Fill fields completely.');
    const email = `${room.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedside.project`;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return alert("Sign Up Error: " + error.message);
    alert('Account created! Try logging in.');
}

async function handleLogin() {
    if (!supabaseClient) return alert("Initializing...");
    const room = document.getElementById('auth-room').value.trim(), password = document.getElementById('auth-password').value;
    if (!room || !password) return alert('Fill fields completely.');
    const email = `${room.toLowerCase().replace(/[^a-z0-9]/g, '')}@bedside.project`;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert("Login Error: " + error.message);
    currentUser = data.user;
    loadUserProfile();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

async function checkCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) { currentUser = user; loadUserProfile(); }
}

async function loadUserProfile() {
    const { data, error } = await supabaseClient.from('profiles').select('room_number').eq('id', currentUser.id).single();
    if (error) return showSettingsUi();
    if (data && data.room_number) { currentRoomNumber = data.room_number; showChatUi(); } else { showSettingsUi(); }
}

async function saveSettings() {
    const roomNum = document.getElementById('room-setup-input').value;
    if (!roomNum) return alert('Please enter your room assignment.');
    const { error } = await supabaseClient.from('profiles').upsert({ id: currentUser.id, room_number: roomNum, updated_at: new Date() });
    if (error) return alert("Save Error: " + error.message);
    currentRoomNumber = roomNum;
    showChatUi();
}

async function handleDischarge() {
    if (!confirm("Purge all live message logs?")) return;
    await supabaseClient.from('messages').delete().eq('sender_name', "Room " + currentRoomNumber);
    await supabaseClient.from('profiles').delete().eq('id', currentUser.id);
    handleLogout();
}

function showSettingsUi() {
    document.getElementById('denied-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'block';
    document.getElementById('room-setup-input').value = currentRoomNumber === "Unknown Room" ? "" : currentRoomNumber;
    document.getElementById('cancel-settings-btn').style.display = currentRoomNumber !== "Unknown Room" ? "block" : "none";
}

function showChatUi() {
    document.getElementById('denied-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'block';
    document.getElementById('room-display-tag').innerText = "Room " + currentRoomNumber;
    renderWireframeList(); setupRealtimeStream(); fetchMessages();
}

async function fetchMessages() {
    const { data } = await supabaseClient.from('messages').select('*').eq('room_id', ROOM_ID).order('created_at', { ascending: true });
    if (data) { document.getElementById('chat-box').innerHTML = ''; data.forEach(msg => appendMessage(msg)); }
}

function appendMessage(msg) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    const isMe = msg.sender_name === "Room " + currentRoomNumber, wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
    wrapper.innerHTML = `<span class="msg-meta">${msg.sender_name} • ${new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span><div class="message">${msg.message_content}</div>`;
    chatBox.appendChild(wrapper); chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input || !input.value) return;
    const { error } = await supabaseClient.from('messages').insert([{ room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: input.value }]);
    if (!error) input.value = '';
}

function setupRealtimeStream() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, () => {
        fetchMessages(); renderWireframeList();
    }).subscribe();
}

function toggleViewMode() {
    const listFeed = document.getElementById('wireframe-dashboard-list'), chatFeed = document.getElementById('chat-box-view-wrapper'), toggleBtn = document.getElementById('view-toggle-btn');
    isViewingChatBox = !isViewingChatBox;
    listFeed.style.display = isViewingChatBox ? 'none' : 'block';
    chatFeed.style.display = isViewingChatBox ? 'block' : 'none';
    toggleBtn.innerText = isViewingChatBox ? "📋 View Room List" : "💬 Open Chat Box";
    if (!isViewingChatBox) renderWireframeList();
}

async function renderWireframeList() {
    const listContainer = document.getElementById('wireframe-dashboard-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    try {
        const { data: profiles } = await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true });
        if (!profiles) return;
        for (const p of profiles) {
            if (!p.room_number) continue;
            const { data: msg } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
            const text = msg && msg.length > 0 ? msg.message_content : "No message history yet", row = document.createElement('div');
            row.className = 'wireframe-row';
            row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${text}</div></div>`;
            listContainer.appendChild(row);
        }
    } catch (e) { console.error(e); }
}

window.addEventListener('DOMContentLoaded', initSupabase);
