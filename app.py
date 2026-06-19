from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
import os
import secrets
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
DB_PATH = os.path.join(os.path.dirname(__file__), 'diary.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                mood TEXT DEFAULT 'neutral',
                tags TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        conn.commit()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        return f(*args, **kwargs)
    return decorated


@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('index.html', username=session.get('username', ''))


@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Введи логин и пароль'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Логин должен быть не короче 3 символов'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Пароль должен быть не короче 4 символов'}), 400

    password_hash = generate_password_hash(password)
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    try:
        with get_db() as conn:
            cursor = conn.execute(
                'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
                (username, password_hash, now)
            )
            conn.commit()
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Этот логин уже занят'}), 409

    session['user_id'] = user_id
    session['username'] = username
    return jsonify({'success': True, 'username': username}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Неверный логин или пароль'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'success': True, 'username': user['username']})


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/me', methods=['GET'])
def me():
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    return jsonify({'username': session.get('username', '')})


@app.route('/api/notes', methods=['GET'])
@login_required
def get_notes():
    user_id = session['user_id']
    search = request.args.get('search', '').strip()
    sort = request.args.get('sort', 'desc')
    order = 'DESC' if sort == 'desc' else 'ASC'

    with get_db() as conn:
        if search:
            notes = conn.execute(
                f'''SELECT * FROM notes
                    WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)
                    ORDER BY created_at {order}''',
                (user_id, f'%{search}%', f'%{search}%', f'%{search}%')
            ).fetchall()
        else:
            notes = conn.execute(
                f'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at {order}',
                (user_id,)
            ).fetchall()

    return jsonify([dict(n) for n in notes])


@app.route('/api/notes', methods=['POST'])
@login_required
def create_note():
    user_id = session['user_id']
    data = request.get_json()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    mood = data.get('mood', 'neutral')
    tags = data.get('tags', '').strip()

    if not title or not content:
        return jsonify({'error': 'Title and content required'}), 400

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        cursor = conn.execute(
            'INSERT INTO notes (user_id, title, content, mood, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (user_id, title, content, mood, tags, now, now)
        )
        conn.commit()
        note_id = cursor.lastrowid
        note = conn.execute('SELECT * FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id)).fetchone()

    return jsonify(dict(note)), 201


@app.route('/api/notes/<int:note_id>', methods=['GET'])
@login_required
def get_note(note_id):
    user_id = session['user_id']
    with get_db() as conn:
        note = conn.execute('SELECT * FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id)).fetchone()
    if not note:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(note))


@app.route('/api/notes/<int:note_id>', methods=['PUT'])
@login_required
def update_note(note_id):
    user_id = session['user_id']
    data = request.get_json()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    mood = data.get('mood', 'neutral')
    tags = data.get('tags', '').strip()

    if not title or not content:
        return jsonify({'error': 'Title and content required'}), 400

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        existing = conn.execute('SELECT id FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id)).fetchone()
        if not existing:
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            'UPDATE notes SET title=?, content=?, mood=?, tags=?, updated_at=? WHERE id=? AND user_id=?',
            (title, content, mood, tags, now, note_id, user_id)
        )
        conn.commit()
        note = conn.execute('SELECT * FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id)).fetchone()

    return jsonify(dict(note))


@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    user_id = session['user_id']
    with get_db() as conn:
        note = conn.execute('SELECT id FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id)).fetchone()
        if not note:
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM notes WHERE id = ? AND user_id = ?', (note_id, user_id))
        conn.commit()
    return jsonify({'success': True})


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    user_id = session['user_id']
    with get_db() as conn:
        total = conn.execute('SELECT COUNT(*) as c FROM notes WHERE user_id = ?', (user_id,)).fetchone()['c']
        this_month = conn.execute(
            "SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
            (user_id,)
        ).fetchone()['c']
        moods = conn.execute(
            "SELECT mood, COUNT(*) as c FROM notes WHERE user_id = ? GROUP BY mood",
            (user_id,)
        ).fetchall()
    return jsonify({
        'total': total,
        'this_month': this_month,
        'moods': [dict(m) for m in moods]
    })


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
