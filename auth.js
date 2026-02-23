/**
 * NGIS Floorplan Editor – Authentication Gate
 *
 * Copyright (c) 2025–2026 NGIS PTE LTD. All rights reserved.
 * Author: Christian Zeh | Contact: info@ng-is.com
 * PROPRIETARY AND CONFIDENTIAL
 *
 * Password is never stored in plain text. The stored value is a SHA-256 hash
 * verified at runtime. Uses the browser's native Web Crypto API (secure context)
 * with an automatic pure-JS fallback for plain-HTTP deployments.
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

    // Pure-JS SHA-256 — fallback for plain-HTTP contexts where crypto.subtle is unavailable.
    function sha256JS(str) {
        const K = [
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
        ];
        let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const rr = (v, n) => (v >>> n) | (v << (32 - n));
        const enc = new TextEncoder().encode(str);
        const len = enc.length, bitLen = len * 8;
        const padLen = (len + 9 + 63) & ~63;
        const m = new Uint8Array(padLen);
        m.set(enc);
        m[len] = 0x80;
        for (let i = 0; i < 8; i++) m[padLen - 8 + i] = (bitLen / Math.pow(2, (7 - i) * 8)) & 0xff;
        for (let off = 0; off < padLen; off += 64) {
            const w = new Uint32Array(64);
            for (let i = 0; i < 16; i++)
                w[i] = (m[off+i*4]<<24)|(m[off+i*4+1]<<16)|(m[off+i*4+2]<<8)|m[off+i*4+3];
            for (let i = 16; i < 64; i++) {
                const s0 = rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3);
                const s1 = rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10);
                w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
            }
            let [a,b,c,d,e,f,g,hh] = h;
            for (let i = 0; i < 64; i++) {
                const t1 = (hh+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0;
                const t2 = ((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))|0;
                hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
            }
            h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
            h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
        }
        return h.map(v => (v >>> 0).toString(16).padStart(8,'0')).join('');
    }

    async function sha256(str) {
        if (crypto?.subtle) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
        }
        return sha256JS(str);
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
