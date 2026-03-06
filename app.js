function login(mode) {
    localStorage.setItem('auth_mode', mode);
    
    const authUrl = "https://accounts.spotify.com/authorize";
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'token', 
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        show_dialog: true
    });

    window.location.href = `${authUrl}?${params.toString()}`;
}
