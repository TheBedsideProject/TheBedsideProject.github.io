let supabaseClient = null, currentUser = null, currentRoomNumber = "Unknown Room", isViewingChatBox = false;
const scriptElement = document.createElement('script');
scriptElement.src = 'https://jsdelivr.net';
scriptElement.onload = () => {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    checkCurrentUser();
};
document.head.appendChild(scriptElement);
async function handleSignUp() {
    const email = document.getElementById('auth-email').value, password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('Fill fields completely.');
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert('Account created! Try logging in.');
}
async function handleLogin() {
    const email = document.getElementById('auth-email').value, password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('Fill fields completely.');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
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
    const { data } = await supabaseClient.from('profiles').select('room_number').eq('id', currentUser.id).single();
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
    if (!confirm("Discharge profile execution: This completely purges logs.")) return;
    await supabaseClient.from('messages').delete().eq('sender_name', "Room " + currentRoomNumber);
    await supabaseClient.from('profiles').delete().eq('id', currentUser.id);
    handleLogout();
}
function showSettingsUi() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'block';
    document.getElementById('room-setup-input').value = currentRoomNumber === "Unknown Room" ? "" : currentRoomNumber;
    document.getElementById('cancel-settings-btn').style.display = currentRoomNumber !== "Unknown Room" ? "block" : "none";
}
function showChatUi() {
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
    wrapper.innerHTML = `<span class="msg-meta">${msg.sender_name} • ${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span><div class="message">${msg.message_content}</div>`;
    chatBox.appendChild(wrapper); chatBox.scrollTop = chatBox.scrollHeight;
}
async function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input || !input.value) return;
    const { error } = await supabaseClient.from('messages').insert([{ room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: input.value }]);
    if (!error) input.value = '';
}
function setupRealtimeStream() {
    supabaseClient.channel('public:messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, payload => {
        appendMessage(payload.new); renderWireframeList();
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
    const { data: profiles } = await supabaseClient.from('profiles').select('room_number').order('room_number', { ascending: true });
    if (!profiles) return;
    for (const p of profiles) {
        if (!p.room_number) continue;
        const { data: msg } = await supabaseClient.from('messages').select('message_content').eq('sender_name', "Room " + p.room_number).order('created_at', { ascending: false }).limit(1);
        const text = msg && msg.length > 0 ? msg[0].message_content : "No message history yet", row = document.createElement('div');
        row.className = 'wireframe-row';
        row.innerHTML = `<div class="status-indicator"></div><div class="meta-block"><div class="room-heading">Room ${p.room_number}</div><div class="last-transmission-text">${text}</div></div>`;
        listContainer.appendChild(row);
    }
}
