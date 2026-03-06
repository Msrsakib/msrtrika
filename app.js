const CLIENT_ID = '06d193a8eb8e4ecf927a49a943527239'; 
const REDIRECT_URI = 'https://msrsakib.github.io/msrtrika/'; 
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';

let accessToken = '';

function log(message) {
    const logDiv = document.getElementById('status-log');
    if(logDiv) {
        logDiv.innerHTML += `> ${message}<br>`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }
    console.log(message);
}

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
    
    window.location.hash = ""; 

    if (mode === 'source') {
        log("Logged into Source ID.");
        await fetchSourceData();
    } else if (mode === 'target') {
        log("Logged into Target ID. Starting Migration...");
        await startMigration();
    }
}

async function fetchSourceData() {
    log("Fetching your playlists and tracks...");
    try {
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        
        let fullData = [];
        for (let pl of data.items) {
            log(`Fetching tracks for: ${pl.name}`);
            const trackRes = await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/tracks`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const trackData = await trackRes.json();
            const trackUris = trackData.items.map(t => t.track.uri).filter(uri => uri != null);
            
            fullData.push({ name: pl.name, tracks: trackUris });
        }
        
        localStorage.setItem('saved_playlists', JSON.stringify(fullData));
        
        document.getElementById('source-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.remove('hidden');
        document.getElementById('playlist-count').innerText = `Ready to move: ${fullData.length} playlists`;
        log("Source data saved locally. Ready for Target ID.");
    } catch (err) {
        log("Error: " + err.message);
    }
}

async function startMigration() {
    const playlists = JSON.parse(localStorage.getItem('saved_playlists'));
    if (!playlists) return log("No data found to migrate.");

    try {
        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = await userRes.json();
        const targetUserId = user.id;

        log(`Target User: ${user.display_name}`);

        for (const pl of playlists) {
            if (pl.tracks.length === 0) continue;

            log(`Creating: ${pl.name}...`);
            const createRes = await fetch(`https://api.spotify.com/v1/users/${targetUserId}/playlists`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: pl.name, public: false })
            });
            const newPlaylist = await createRes.json();

            log(`Adding ${pl.tracks.length} songs to ${pl.name}...`);
            await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: pl.tracks })
            });
        }
        log("SUCCESS! All playlists moved.");
        localStorage.removeItem('saved_playlists');
    } catch (err) {
        log("Migration Error: " + err.message);
    }
}

window.onload = handleCallback;
