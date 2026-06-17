/* =============================================
   ЛИЧНЫЙ ДНЕВНИК — Frontend Logic
   ============================================= */

const MOOD_MAP = {
    great:   { emoji: '😄', label: 'Отлично' },
    good:    { emoji: '🙂', label: 'Хорошо' },
    neutral: { emoji: '😐', label: 'Нейтрально' },
    bad:     { emoji: '😔', label: 'Плохо' },
    awful:   { emoji: '😞', label: 'Ужасно' },
};

// ── STATE ──────────────────────────────────────
let state = {
    notes: [],
    currentNoteId: null,
    sortOrder: 'desc',
    searchQuery: '',
    pendingDeleteId: null,
};

// ── DOM REFS ───────────────────────────────────
const $  = id => document.getElementById(id);
const notesList      = $('notes-list');
const welcomeScreen  = $('welcome-screen');
const noteView       = $('note-view');
const noteEditor     = $('note-editor');
const searchInput    = $('search-input');
const searchClear    = $('search-clear');
const charCount      = $('char-count');
const deleteModal    = $('delete-modal');
const toast          = $('toast');

// ── INIT ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadNotes();
    loadStats();
    bindEvents();
});

// ── EVENTS ─────────────────────────────────────
function bindEvents() {
    // New note
    $('btn-new-note').addEventListener('click', openNewEditor);
    $('btn-welcome-new').addEventListener('click', openNewEditor);

    // Search
    searchInput.addEventListener('input', e => {
        state.searchQuery = e.target.value;
        searchClear.style.display = e.target.value ? 'block' : 'none';
        debounce(() => loadNotes(), 300)();
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.style.display = 'none';
        loadNotes();
    });

    // Sort
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sortOrder = btn.dataset.sort;
            loadNotes();
        });
    });

    // Editor
    $('btn-cancel-edit').addEventListener('click', cancelEdit);
    $('btn-save-note').addEventListener('click', saveNote);
    $('btn-edit-note').addEventListener('click', openEditEditor);
    $('btn-delete-note').addEventListener('click', () => openDeleteModal(state.currentNoteId));

    // Mood picker
    $('mood-options').addEventListener('click', e => {
        const btn = e.target.closest('.mood-btn');
        if (!btn) return;
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

    // Char count
    $('edit-content').addEventListener('input', () => {
        const len = $('edit-content').value.length;
        charCount.textContent = `${len.toLocaleString('ru-RU')} символов`;
    });

    // Modal
    $('modal-cancel').addEventListener('click', closeDeleteModal);
    $('modal-confirm').addEventListener('click', confirmDelete);
    deleteModal.addEventListener('click', e => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (noteEditor.style.display !== 'none') cancelEdit();
            if (deleteModal.style.display !== 'none') closeDeleteModal();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (noteEditor.style.display !== 'none') {
                e.preventDefault();
                saveNote();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            openNewEditor();
        }
    });
}

// ── DATA ───────────────────────────────────────
async function loadNotes() {
    const params = new URLSearchParams({
        sort: state.sortOrder,
        ...(state.searchQuery && { search: state.searchQuery }),
    });

    const data = await api(`/api/notes?${params}`);
    if (data === null) return;
    state.notes = data;
    renderNotesList();
}

async function loadStats() {
    const data = await api('/api/stats');
    if (!data) return;
    $('stat-total').textContent = data.total;
    $('stat-month').textContent = data.this_month;
}

// ── RENDER ─────────────────────────────────────
function renderNotesList() {
    if (!state.notes.length) {
        notesList.innerHTML = `<div class="empty-state-sidebar">${
            state.searchQuery
                ? `По запросу «${escapeHtml(state.searchQuery)}» ничего не найдено`
                : 'Записей пока нет. Создай первую!'
        }</div>`;
        return;
    }

    notesList.innerHTML = state.notes.map(n => {
        const mood = MOOD_MAP[n.mood] || MOOD_MAP.neutral;
        const date = formatDate(n.created_at);
        const preview = n.content.replace(/\n+/g, ' ').slice(0, 80);
        const isActive = n.id === state.currentNoteId;
        const titleHtml = highlight(escapeHtml(n.title), state.searchQuery);
        const previewHtml = highlight(escapeHtml(preview), state.searchQuery);

        return `
        <div class="note-card ${isActive ? 'active' : ''}" data-id="${n.id}">
            <div class="note-card-title">${titleHtml}</div>
            <div class="note-card-preview">${previewHtml}</div>
            <div class="note-card-footer">
                <span class="note-card-date">${date}</span>
                <span class="note-card-mood" title="${mood.label}">${mood.emoji}</span>
            </div>
        </div>`;
    }).join('');

    notesList.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', () => openNote(parseInt(card.dataset.id)));
    });
}

async function openNote(id) {
    const note = state.notes.find(n => n.id === id);
    if (!note) return;

    state.currentNoteId = id;
    renderNotesList(); // update active state

    const mood = MOOD_MAP[note.mood] || MOOD_MAP.neutral;

    $('view-title').textContent = note.title;
    $('view-date').textContent = formatDateFull(note.created_at);
    $('view-mood').textContent = mood.emoji;
    $('view-mood').title = mood.label;

    // Tags
    const tagsEl = $('view-tags');
    if (note.tags && note.tags.trim()) {
        tagsEl.innerHTML = note.tags.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');
    } else {
        tagsEl.innerHTML = '';
    }

    // Content with search highlight
    const contentEl = $('view-content');
    const contentHtml = highlight(escapeHtml(note.content), state.searchQuery);
    contentEl.innerHTML = contentHtml;

    showScreen('view');
}

// ── EDITOR ─────────────────────────────────────
function openNewEditor() {
    $('editor-mode-label').textContent = 'Новая запись';
    $('edit-note-id').value = '';
    $('edit-title').value = '';
    $('edit-content').value = '';
    $('edit-tags').value = '';
    charCount.textContent = '0 символов';
    setMood('neutral');
    showScreen('editor');
    $('edit-title').focus();
}

function openEditEditor() {
    const note = state.notes.find(n => n.id === state.currentNoteId);
    if (!note) return;

    $('editor-mode-label').textContent = 'Редактирование';
    $('edit-note-id').value = note.id;
    $('edit-title').value = note.title;
    $('edit-content').value = note.content;
    $('edit-tags').value = note.tags || '';
    charCount.textContent = `${note.content.length.toLocaleString('ru-RU')} символов`;
    setMood(note.mood || 'neutral');
    showScreen('editor');
    $('edit-title').focus();
}

function setMood(mood) {
    document.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mood === mood);
    });
}

function getSelectedMood() {
    const btn = document.querySelector('.mood-btn.active');
    return btn ? btn.dataset.mood : 'neutral';
}

function cancelEdit() {
    if (state.currentNoteId) {
        openNote(state.currentNoteId);
    } else {
        showScreen('welcome');
    }
}

async function saveNote() {
    const id = $('edit-note-id').value;
    const title = $('edit-title').value.trim();
    const content = $('edit-content').value.trim();
    const mood = getSelectedMood();
    const tags = $('edit-tags').value.trim();

    if (!title) { showToast('Введи заголовок', 'error'); $('edit-title').focus(); return; }
    if (!content) { showToast('Запись не может быть пустой', 'error'); $('edit-content').focus(); return; }

    const body = { title, content, mood, tags };
    let saved;

    if (id) {
        saved = await api(`/api/notes/${id}`, 'PUT', body);
    } else {
        saved = await api('/api/notes', 'POST', body);
    }

    if (!saved) return;

    showToast(id ? 'Запись обновлена' : 'Запись сохранена', 'success');
    await loadNotes();
    await loadStats();
    state.currentNoteId = saved.id;
    openNote(saved.id);
}

// ── DELETE ─────────────────────────────────────
function openDeleteModal(id) {
    state.pendingDeleteId = id;
    deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    deleteModal.style.display = 'none';
    state.pendingDeleteId = null;
}

async function confirmDelete() {
    const id = state.pendingDeleteId;
    if (!id) return;

    const result = await api(`/api/notes/${id}`, 'DELETE');
    if (!result) return;

    closeDeleteModal();
    showToast('Запись удалена', 'info');

    state.currentNoteId = null;
    await loadNotes();
    await loadStats();
    showScreen('welcome');
}

// ── SCREENS ─────────────────────────────────────
function showScreen(name) {
    welcomeScreen.style.display = name === 'welcome' ? 'flex' : 'none';
    noteView.style.display      = name === 'view'    ? 'flex' : 'none';
    noteEditor.style.display    = name === 'editor'  ? 'flex' : 'none';
}

// ── API ─────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
    try {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Ошибка сервера', 'error');
            return null;
        }
        return data;
    } catch (err) {
        showToast('Нет связи с сервером', 'error');
        return null;
    }
}

// ── UTILS ───────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function highlight(html, query) {
    if (!query) return html;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

let _debounceTimer;
function debounce(fn, ms) {
    return function(...args) {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => fn.apply(this, args), ms);
    };
}

let _toastTimer;
function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
