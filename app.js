const CLIENT_ID = '06d193a8eb8e4ecf927a49a943527239';
const REDIRECT_URI = 'https://msrsakib.github.io/msrtrika/';
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';

// UI Helper to show status
function updateStatus(text) {
    const logDiv = document.getElementById('status-log');
    if (logDiv) {
        logDiv.innerHTML += `> ${text}<br>`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }
    console.log(text);
}

// PKCE Helpers
const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

// 1. Login Function
async function login(mode) {
    updateStatus(`Initiating ${mode} login...`);
    localStorage.setItem('auth_mode', mode);
    
    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    localStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        show_dialog: true
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// 2. Handle Callback & Token Exchange
async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (!code) return; // No code found, probably just landed on home page

    updateStatus("Exchanging code for token...");
    const codeVerifier = localStorage.getItem('code_verifier');
    const mode = localStorage.getItem('auth_mode');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier,
            }),
        });

        const data = await response.json();
        if (data.access_token) {
            updateStatus("Token received successfully!");
            window.history.replaceState({}, document.title, REDIRECT_URI); // Clean URL
            
            if (mode === 'source') {
                await fetchSourceData(data.access_token);
            } else if (mode === 'target') {
                await startMigration(data.access_token);
            }
        } else {
            updateStatus("Error: Failed to get access token.");
        }
    } catch (err) {
        updateStatus("Callback Error: " + err.message);
    }
}

// 3. Fetch Source Playlists
async function fetchSourceData(token) {
    updateStatus("Loading your playlists...");
    try {
        const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        let fullData = [];
        for (let pl of data.items) {
            updateStatus(`Scanning: ${pl.name}`);
            const trackRes = await fetch(pl.tracks.href, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const trackData = await trackRes.json();
            const uris = trackData.items.map(t => t.track?.uri).filter(u => u);
            fullData.push({ name: pl.name, tracks: uris });
        }
        
        localStorage.setItem('saved_playlists', JSON.stringify(fullData));
        
        // Show the next step UI
        document.getElementById('source-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.remove('hidden');
        document.getElementById('playlist-count').innerText = `Saved ${fullData.length} playlists. Now switch accounts!`;
        updateStatus("Step 1 Complete! Please logout of Spotify in another tab and click Step 2.");
    } catch (err) {
        updateStatus("Fetch Error: " + err.message);
    }
}

// 4. Migration to Target ID
async function startMigration(token) {
    const playlists = JSON.parse(localStorage.getItem('saved_playlists'));
    if (!playlists) {
        updateStatus("No saved data found. Start from Step 1.");
        return;
    }

    try {
        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await userRes.json();
        updateStatus(`Logged in as Target: ${user.display_name}`);

        for (const pl of playlists) {
            updateStatus(`Creating Playlist: ${pl.name}`);
            const createRes = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: pl.name, public: false })
            });
            const newPl = await createRes.json();
            
            if (pl.tracks.length > 0) {
                updateStatus(`Adding ${pl.tracks.length} tracks...`);
                await fetch(`https://api.spotify.com/v1/playlists/${newPl.id}/tracks`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uris: pl.tracks.slice(0, 100) }) 
                });
            }
        }
        updateStatus("SUCCESS! Migration finished.");
        localStorage.removeItem('saved_playlists');
    } catch (err) {
        updateStatus("Migration Error: " + err.message);
    }
}

// Run on load
window.onload = handleCallback;
