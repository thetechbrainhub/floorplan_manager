/**
 * NGIS Floorplan Editor – Authentication Gate
 *
 * Copyright (c) 2025–2026 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 *
 * Password is never stored in plain text. The stored value is a SHA-256 hash
 * verified at runtime via the browser's native Web Crypto API.
 * Session persists for the lifetime of the browser tab (sessionStorage).
 */

(async function () {
    const HASH        = 'eea85c897fa91bdbc84b4150544048b8f62c875cca78f26f8d011dfb9c3665c9';
    const SESSION_KEY = 'ngis_auth_v1';

    // Logout button — always wired up so it works after a page reload with active session.
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        location.reload();
    });

    const overlay = document.getElementById('auth-overlay');

    // Already authenticated this browser session — remove overlay immediately.
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
        overlay.remove();
        return;
    }

    const input = document.getElementById('auth-password');
    const btn   = document.getElementById('auth-submit');
    const errEl = document.getElementById('auth-error');

    input.focus();

    async function sha256(str) {
        const buf = await crypto.subtle.digest(
            'SHA-256', new TextEncoder().encode(str)
        );
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function attempt() {
        const hash = await sha256(input.value);
        if (hash === HASH) {
            sessionStorage.setItem(SESSION_KEY, '1');
            overlay.style.transition = 'opacity 0.3s';
            overlay.style.opacity    = '0';
            setTimeout(() => overlay.remove(), 300);
        } else {
            errEl.textContent = 'Incorrect password. Please try again.';
            input.value = '';
            input.classList.add('auth-shake');
            setTimeout(() => input.classList.remove('auth-shake'), 500);
            input.focus();
        }
    }

    btn.addEventListener('click', attempt);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
})();
