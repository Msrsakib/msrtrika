const CLIENT_ID = '06d193a8eb8e4ecf927a49a943527239';
const REDIRECT_URI = 'https://msrsakib.github.io/msrtrika/';
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';

// Logger Function
function log(msg) {
    const logDiv = document.getElementById('status-log');
    const time = new Date().toLocaleTimeString().split(' ')[0];
    logDiv.innerHTML += `<br>[${time}] > ${msg}`;
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(msg);
}

// PKCE Security Helpers
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

// 1. Auth Login
async function login(mode) {
    log(`Starting ${mode} authentication...`);
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

// 2. Token Exchange
async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (!code) return;

    log("Auth code detected. Requesting Access Token...");
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
            log("Access Token granted.");
            window.history.replaceState({}, document.title, REDIRECT_URI);
            
            if (mode === 'source') {
                await fetchSourceData(data.access_token);
            } else if (mode === 'target') {
                await startMigration(data.access_token);
            }
        }
    } catch (err) {
        log("ERROR: " + err.message);
    }
}

// 3. Data Fetch
async function fetchSourceData(token) {
    log("Fetching playlists from Source Account...");
    try {
        const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        let fullData = [];
        for (let pl of data.items) {
            log(`Reading: ${pl.name}`);
            const trackRes = await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/tracks`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const trackData = await trackRes.json();
            const uris = trackData.items.map(t => t.track?.uri).filter(u => u);
            fullData.push({ name: pl.name, tracks: uris });
        }
        
        localStorage.setItem('saved_playlists', JSON.stringify(fullData));
        document.getElementById('source-section').classList.add('hidden');
        document.getElementById('transfer-section').classList.remove('hidden');
        document.getElementById('playlist-count').innerText = `READY: ${fullData.length} Playlists Stored.`;
        log("STEP 1 COMPLETE. Please logout from Spotify and click Step 2.");
    } catch (err) {
        log("Fetch Error: " + err.message);
    }
}

// 4. Migration
async function startMigration(token) {
    const playlists = JSON.parse(localStorage.getItem('saved_playlists'));
    if (!playlists) return log("No data found! Restart from Step 1.");

    try {
        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await userRes.json();
        log(`Logged into Target: ${user.display_name}`);

        for (const pl of playlists) {
            log(`Creating Playlist: ${pl.name}`);
            const createRes = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: pl.name, public: false })
            });
            const newPl = await createRes.json();
            
            if (pl.tracks.length > 0) {
                log(`Adding ${pl.tracks.length} tracks to ${pl.name}...`);
                await fetch(`https://api.spotify.com/v1/playlists/${newPl.id}/tracks`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uris: pl.tracks.slice(0, 100) }) 
                });
            }
        }
        log("ALL TASKS COMPLETED SUCCESSFULLY!");
        localStorage.removeItem('saved_playlists');
    } catch (err) {
        log("Migration Error: " + err.message);
    }
}

window.onload = handleCallback;
