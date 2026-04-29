var AuthManager = (function () {
    var TOKEN_KEY = 'access_token';
    var EXPIRES_KEY = 'expires_in';
    var LOGIN_API_URL = 'https://api.vivvi.net/api/v1/user/login';

    function getStoredToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getStoredExpiry() {
        var v = localStorage.getItem(EXPIRES_KEY);
        return v ? parseInt(v, 10) : 0;
    }

    function isTokenValid(token, expiry) {
        if (!token) return false;
        if (expiry && expiry > Date.now()) return true;
        // Fallback: decode JWT payload and check exp field
        try {
            var parts = token.split('.');
            if (parts.length !== 3) return false;
            var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload.exp && (payload.exp * 1000) > Date.now();
        } catch (e) {
            return false;
        }
    }

    function storeToken(token, expiresIn) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(EXPIRES_KEY, String(expiresIn));
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EXPIRES_KEY);
    }

    function showAuthForm() {
        loader.hide();
        $('#auth-form-wrapper').removeClass('d-none');
        $('#login-form').addClass('d-none');
    }

    function showDeviceForm() {
        $('#auth-form-wrapper').addClass('d-none');
        $('#login-form').removeClass('d-none');
    }

    function handleLoginSubmit() {
        var email = $('#auth-email').val().trim();
        var password = $('#auth-password').val();
        var $btn = $('#auth-submit');
        var $error = $('#auth-error');

        if (!email || !password) {
            $error.text('Please enter your email and password.').removeClass('d-none');
            return;
        }

        $btn.prop('disabled', true).text('Signing in\u2026');
        $error.addClass('d-none');

        $.ajax({
            url: LOGIN_API_URL,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ email: email, password: password, rememberMe: true }),
            success: function (data) {
                if (data && data.access_token && data.expiresIn) {
                    storeToken(data.access_token, data.expiresIn);
                    showDeviceForm();
                    initializeApp();
                } else {
                    $error.text('Login failed. Please try again.').removeClass('d-none');
                    $btn.prop('disabled', false).text('Sign In');
                }
            },
            error: function (xhr) {
                var msg = 'Login failed. Please check your credentials.';
                try {
                    var resp = JSON.parse(xhr.responseText);
                    if (resp && resp.message && resp.message.message) {
                        msg = resp.message.message;
                    }
                } catch (e) { /* ignore parse error */ }
                $error.text(msg).removeClass('d-none');
                $btn.prop('disabled', false).text('Sign In');
            }
        });
    }

    function init() {
        // Support passing token via URL query parameter ?jwt=TOKEN
        var query = getQueryParams(document.location.search);
        if (query.jwt) {
            try {
                var parts = query.jwt.split('.');
                if (parts.length === 3) {
                    var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    var expMs = payload.exp ? payload.exp * 1000 : 0;
                    if (expMs > Date.now()) {
                        storeToken(query.jwt, expMs);
                        // Remove jwt param from URL without reloading
                        var cleanUrl = window.location.pathname + window.location.hash;
                        window.history.replaceState({}, document.title, cleanUrl);
                    }
                }
            } catch (e) {
                console.warn('Auth: could not parse JWT from URL', e);
            }
        }

        var token = getStoredToken();
        var expiry = getStoredExpiry();

        if (isTokenValid(token, expiry)) {
            showDeviceForm();
            initializeApp();
        } else {
            clearToken();
            showAuthForm();
        }

        $('#auth-form-wrapper').on('submit', '#auth-form', function (e) {
            e.preventDefault();
            handleLoginSubmit();
        });
    }

    return {
        init: init,
        clearToken: clearToken,
        getToken: getStoredToken
    };
})();

$(document).ready(function () {
    AuthManager.init();
});
