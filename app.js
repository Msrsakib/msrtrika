const CLIENT_ID = '06d193a8eb8e4ecf927a49a943527239';
const REDIRECT_URI = 'https://msrsakib.github.io/msrtrika/';
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';

// Helper: Generate Random String for PKCE
const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

// Helper: SHA256 Hashing for PKCE
const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

// 1. Login Function (PKCE Flow)
async function login(mode) {
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

// 2. Handle Callback (Get Token from Code)
async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (!code) return;

    const codeVerifier = localStorage.getItem('code_verifier');
    const mode = localStorage.getItem('auth_mode');

    const payload = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        }),
    };

    const body = await fetch('http://googleusercontent.com/spotify.com/9', payload);
    const response = await body.json();
    
    const accessToken = response.access_token;
    window.history.replaceState({}, document.title, REDIRECT_URI); // Clean URL

    if (mode === 'source') {
        await fetchSourceData(accessToken);
    } else if (mode === 'target') {
        await startMigration(accessToken);
    }
}

// 3. Fetch Data & Migration (Same Logic)
async function fetchSourceData(token) {
    console.log("Fetching playlists...");
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    let fullData = [];
    for (let pl of data.items) {
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
    alert("Source Data Saved! Now Logout and login with Target ID.");
}

async function startMigration(token) {
    const playlists = JSON.parse(localStorage.getItem('saved_playlists'));
    const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const user = await userRes.json();

    for (const pl of playlists) {
        const createRes = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: pl.name, public: false })
        });
        const newPl = await createRes.json();
        
        if (pl.tracks.length > 0) {
            await fetch(`https://api.spotify.com/v1/playlists/${newPl.id}/tracks`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uris: pl.tracks.slice(0, 100) }) // Spotify limit 100 per request
            });
        }
    }
    alert("Migration Finished!");
}

window.onload = handleCallback;
