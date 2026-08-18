let supabaseClient = null;
let currentUser = null;
let currentRoomNumber = "Unknown Room";
let isViewingChatBox = false;

const scriptElement = document.createElement('script');
const jsdelivrDomain = 'cdn.' + 'jsdelivr' + '.net';
const supabasePath = 'npm/' + '@supabase/' + 'supabase-js@2';
scriptElement.src = 'https' + '://' + jsdelivrDomain + '/' + supabasePath;

scriptElement.onload = function() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            checkCurrentUser();
        } else {
            showAccessDenied();
        }
    } catch (e) {
        console.error("Initialization failure:", e);
        showAccessDenied();
    }
};

scriptElement.onerror = function() {
    showAccessDenied();
};

document.head.appendChild(scriptElement);

function showAccessDenied() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('settings-container').style.display = 'none';
    document.getElementById('denied-container').style.display = 'block';
}

function dismissAccessDenied() {
    document.getElementById('denied-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'block';
}

async function handleSignUp() {
    if (!supabaseClient) {
        alert("Database connection is still initializing. Please wait a second.");
        return;
    }
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('Fill fields completely.');
    
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        return alert("Registration Failed: " + error.message);
    }
    alert('Account created! Try logging in.');
}

async function handleLogin() {
    if (!supabaseClient) {
        alert("Database connection is still initializing. Please wait a second.");
        return;
    }
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert('Fill fields completely.');
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        return alert("Login Failed: " + error.message);
    }
    currentUser = data.user;
    loadUserProfile();
}

async function handleLogout() {
    if (!supabaseClient) return location.reload();
    await supabaseClient.auth.signOut();
    location.reload();
}

async function checkCurrentUser() {
    if (!supabaseClient) return;
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            currentUser = user;
            loadUserProfile();
        }
    } catch (e) {
        console.log("No active user session detected on load.");
    }
}

async function loadUserProfile() {
    if (!supabaseClient || !currentUser) return;
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('room_number')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        showSettingsUi();
        return;
    }

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
    const confirmAction = confirm("Discharge profile execution: This completely purges logs.");
    if (!confirmAction) return;

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
    
    renderWireframeList();
    setupRealtimeStream();
    fetchMessages();
}

async function fetchMessages() {
    const { data } = await supabaseClient
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
    if (!chatBox) return;
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
    if (!messageInput || !messageInput.value) return;

    const { error } = await supabaseClient
        .from('messages')
        .insert([
            { room_id: ROOM_ID, sender_name: "Room " + currentRoomNumber, message_content: messageInput.value }
        ]);

    if (!error) {
        messageInput.value = ''; 
    }
}

function setupRealtimeStream() {
    supabaseClient
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${ROOM_ID}` }, payload => {
            appendMessage(payload.new);
            renderWireframeList();
        })
        .subscribe();
}

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

async function renderWireframeList() {
    const listContainer = document.getElementById('wireframe-dashboard-list');
    if (!listContainer) return;
    listContainer.innerHTML = ''; 

    try {
        const { data: allProfiles, error: profileError } = await supabaseClient
            .from('profiles')
            .select('room_number')
            .order('room_number', { ascending: true });

        if (profileError || !allProfiles) {
            listContainer.innerHTML = '<div class="wireframe-row"><div class="meta-block"><div class="room-heading">Establishing profiles...</div></div></div>';
            return;
        }

        for (const profile of allProfiles) {
            if (!profile.room_number) continue;

            let previewText = "No message history yet";
            const { data: lastMsgData } = await supabaseClient
                .from('messages')
                .select('message_content')
                .eq('sender_name', "Room " + profile.room_number)
                .order('created_at', { ascending: false })
                .limit(1);

            if (lastMsgData && lastMsgData.length > 0) {
                previewText = lastMsgData.message_content;
            }

            const row = document.createElement('div');
            row.className = 'wireframe-row';
            row.innerHTML = `
                <div class="status-indicator"></div>
                <div class="meta-block">
                    <div class="room-heading">Room ${profile.room_number}</div>
                    <div class="last-transmission-text">${previewText}</div>
                </div>
            `;
            listContainer.appendChild(row);
        }
    } catch (e) {
        console.error(e);
    }
}
