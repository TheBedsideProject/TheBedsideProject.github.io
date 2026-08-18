let supabaseClient = null;
let currentUser = null;
let currentRoomNumber = "Unknown Room";
let isViewingChatBox = false; // View state tracking flag

// --- 1. DYNAMICALLY LOAD THE SUPABASE LIBRARY ---
const scriptElement = document.createElement('script');
const jsdelivrDomain = 'cdn.' + 'jsdelivr' + '.net';
const supabasePath = 'npm/' + '@supabase/' + 'supabase-js@2';
scriptElement.src = 'https' + '://' + jsdelivrDomain + '/' + supabasePath;

scriptElement.onload = function() {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    checkCurrentUser();
};
document.head.appendChild(scriptElement);

// --- 2. AUTH LOGIC ---
async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('Fill fields completely.');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert('Account created! Try logging in.');
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
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
    if (user) {
        currentUser = user;
        loadUserProfile();
    }
}

// --- 3. PROFILE & SETTINGS LOGIC ---
async function loadUserProfile() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('room_number')
        .eq('id', currentUser.id)
        .single();

    if (data && data.room_number) {
        currentRoomNumber = data.room_number;
        showChatUi();
    } else {
        showSettingsUi();
    }
}

async function saveSettings() {
    const roomNum = document.getElementById('room-setup-input').value;
    if (!roomNum) return alert('Please enter your room assignment.');

    const { error } = await supabaseClient
        .from('profiles')
        .upsert({ id: currentUser.id, room_number: roomNum, updated_at: new Date() });

    if (error) return alert("Save Error: " + error.message);
    currentRoomNumber = roomNum;
    showChatUi();
}

async function handleDischarge() {
    const confirmAction = confirm("Discharge profile execution: This completely purges your message logs and wipes account parameters from the server.");
    if (!confirmAction) return;

    await supabaseClient.from('messages').delete().eq('sender_name', "Room " + currentRoomNumber);
    await supabaseClient.from('profiles').delete().eq('id', currentUser.id);

    alert("Session profile wiped completely.");
    handleLogout();
}

// --- 4. UI NAVIGATION LOGIC ---
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
    
    // Injects structural list content into wireframe overlay panel
    renderWireframeList();
    
    setupRealtimeStream();
    fetchMessages();
}

// --- 5. MESSAGING LOGIC ---
async function fetchMessages() {
    const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('room_id', ROOM_ID)
        .order('created_at', { ascending: true });

    if (data) {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = ''; 
        data.forEach(msg => appendMessage(msg));
    }
}

function appendMessage(msg) {
    const chatBox = document.getElementById('chat-box');
    const targetName = "Room " + currentRoomNumber;
    const isMe = msg.sender_name === targetName;
    
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
    
    const timeString = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    wrapper.innerHTML = `
        <span class="msg-meta">${msg.sender_name} • ${timeString}</span>
        <div class="message">${msg.message_content}</div>
    `;
    
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight; 
}

async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput.value) return;

    const { error } = await supabaseClient
        .from('messages')
        .insert([
            { room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: messageInput.value }
        ]);

    if (!error) {
        messageInput.value = ''; 
    } else {
        console.error(error);
    }
}

function setupRealtimeStream() {
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, payload => {
            appendMessage(payload.new);
        })
        .subscribe();
}

// --- 6. VIEW SEPARATOR CONTROLS (WIREFRAME ENGINE LAYER) ---
function toggleViewMode() {
    const listFeed = document.getElementById('wireframe-dashboard-list');
    const chatFeed = document.getElementById('chat-box-view-wrapper');
    const toggleBtn = document.getElementById('view-toggle-btn');

    if (!isViewingChatBox) {
        listFeed.style.display = 'none';
        chatFeed.style.display = 'block';
        toggleBtn.innerText = "📋 View Room List";
        isViewingChatBox = true;
    } else {
        listFeed.style.display = 'block';
        chatFeed.style.display = 'none';
        toggleBtn.innerText = "💬 Open Chat Box";
        isViewingChatBox = false;
        renderWireframeList();
    }
}

function renderWireframeList() {
    const listContainer = document.getElementById('wireframe-dashboard-list');
    if (!listContainer) return;
    listContainer.innerHTML = ''; 

    // Explicit array loop declaration prevents engine parsing exceptions
    const schematicIndexes =;
    schematicIndexes.forEach(index => {
        const row = document.createElement('div');
        row.className = 'wireframe-row';
        
        // Highlights the user's real room assignment context natively on the top slot
        const displayLabel = (index === 1) ? currentRoomNumber : `${100 + index}`;
        
        row.innerHTML = `
            <div class="status-indicator"></div>
            <div class="meta-block">
                <div class="room-heading">Room ${displayLabel}</div>
                <div class="last-transmission-text">LAST SENT TEXT</div>
            </div>
        `;
        listContainer.appendChild(row);
    });
}
