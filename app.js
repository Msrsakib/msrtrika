async function fetchSourceData(token) {
    log("Fetching playlists from Source Account...");
    try {
        const res = await fetch('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!data.items) {
            log("ERROR: No playlists found or API error.");
            return;
        }

        let fullData = [];
        for (let pl of data.items) {
            log(`Reading: ${pl.name}`);
            try {
                const trackRes = await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/tracks`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const trackData = await trackRes.json();
                
                // Safe check: Ensure items exist before using .map()
                const uris = (trackData.items || [])
                    .map(t => t.track?.uri)
                    .filter(u => u);
                
                fullData.push({ name: pl.name, tracks: uris });
            } catch (trackErr) {
                log(`Skipped ${pl.name}: Could not load tracks.`);
            }
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
