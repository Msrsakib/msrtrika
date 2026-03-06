const CLIENT_ID = '06d193a8eb8e4ecf927a49a943527239'; // Paste your Client ID here
const REDIRECT_URI = window.location.href.split('#')[0].split('?')[0]; 
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';

let accessToken = '';

function log(message) {
    const logDiv = document.getElementById('status-log');
    logDiv.innerHTML += `> ${message}<br>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Login Handler
function login(mode) {
    localStorage.setItem('auth_mode', mode);
    const url = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;
    window.location.href = url;
}

async function handleCallback() {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.substring(1));
    accessToken = params.get('access_token');
    const mode = localStorage.getItem('auth_mode');
    
    window.location.hash = ""; // Clean URL

    if (mode === 'source') {
        log("Logged into Source ID successfully.");
        await fetchSourceData();
    } else if (mode === 'target') {
        log("Logged into Target ID. Starting Migration...");
        await startMigration();
    }
}

async function fetchSourceData() {
    log("Fetching playlists...");
    try {
        const response = await fetch('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        // Save playlists to LocalStorage to use after switching account
        localStorage.setItem('saved_playlists', JSON.stringify(data.items));
        
        document.getElementById('source-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.remove('hidden');
        document.getElementById('playlist-count').innerText = `Playlists found: ${data.items.length}`;
        log(`Found ${data.items.length} playlists.`);
    } catch (err) {
        log("Error fetching playlists: " + err.message);
    }
}

async function startMigration() {
    const playlists = JSON.parse(localStorage.getItem('saved_playlists'));
    if (!playlists) return log("No data found to migrate.");

    // Get Target User ID
    const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const user = await userRes.json();
    const targetUserId = user.id;

    log(`Target User: ${user.display_name}`);

    for (const pl of playlists) {
        log(`Creating playlist: ${pl.name}...`);
        // Step 1: Create new playlist in target account
        const createRes = await fetch(`https://api.spotify.com/v1/users/${targetUserId}/playlists`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: pl.name, public: false })
        });
        const newPlaylist = await createRes.json();
        log(`Playlist created! ID: ${newPlaylist.id}`);
        
        // Note: Adding tracks would require fetching tracks from source first.
        // This is a basic version that clones names. 
    }
    log("Migration Complete!");
}

window.onload = handleCallback;
