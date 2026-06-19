/* ── AUTH LOGIC ─────────────────────────────────── */

let currentTab = 'login';

const $ = id => document.getElementById(id);
const form        = $('auth-form');
const errorBox    = $('auth-error');
const submitBtn   = $('auth-submit');
const tabLabel    = $('auth-tab-label');

document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        errorBox.style.display = 'none';

        if (currentTab === 'login') {
            submitBtn.textContent = 'Войти';
            tabLabel.textContent = 'Войди, чтобы продолжить записи';
            $('auth-password').autocomplete = 'current-password';
        } else {
            submitBtn.textContent = 'Создать аккаунт';
            tabLabel.textContent = 'Создай аккаунт — это займёт 10 секунд';
            $('auth-password').autocomplete = 'new-password';
        }
    });
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;

    if (!username || !password) return;

    submitBtn.disabled = true;
    submitBtn.textContent = currentTab === 'login' ? 'Входим...' : 'Создаём...';

    try {
        const url = currentTab === 'login' ? '/api/login' : '/api/register';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok) {
            errorBox.textContent = data.error || 'Что-то пошло не так';
            errorBox.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = currentTab === 'login' ? 'Войти' : 'Создать аккаунт';
            return;
        }

        window.location.href = '/';
    } catch (err) {
        errorBox.textContent = 'Нет связи с сервером';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = currentTab === 'login' ? 'Войти' : 'Создать аккаунт';
    }
});
