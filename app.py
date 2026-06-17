from flask import Flask, render_template, request, jsonify, redirect, url_for
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'diary.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                mood TEXT DEFAULT 'neutral',
                tags TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')
        conn.commit()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/notes', methods=['GET'])
def get_notes():
    search = request.args.get('search', '').strip()
    sort = request.args.get('sort', 'desc')
    order = 'DESC' if sort == 'desc' else 'ASC'

    with get_db() as conn:
        if search:
            notes = conn.execute(
                f'''SELECT * FROM notes
                    WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
                    ORDER BY created_at {order}''',
                (f'%{search}%', f'%{search}%', f'%{search}%')
            ).fetchall()
        else:
            notes = conn.execute(
                f'SELECT * FROM notes ORDER BY created_at {order}'
            ).fetchall()

    return jsonify([dict(n) for n in notes])


@app.route('/api/notes', methods=['POST'])
def create_note():
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
            'INSERT INTO notes (title, content, mood, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            (title, content, mood, tags, now, now)
        )
        conn.commit()
        note_id = cursor.lastrowid
        note = conn.execute('SELECT * FROM notes WHERE id = ?', (note_id,)).fetchone()

    return jsonify(dict(note)), 201


@app.route('/api/notes/<int:note_id>', methods=['GET'])
def get_note(note_id):
    with get_db() as conn:
        note = conn.execute('SELECT * FROM notes WHERE id = ?', (note_id,)).fetchone()
    if not note:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(note))


@app.route('/api/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    data = request.get_json()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    mood = data.get('mood', 'neutral')
    tags = data.get('tags', '').strip()

    if not title or not content:
        return jsonify({'error': 'Title and content required'}), 400

    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        conn.execute(
            'UPDATE notes SET title=?, content=?, mood=?, tags=?, updated_at=? WHERE id=?',
            (title, content, mood, tags, now, note_id)
        )
        conn.commit()
        note = conn.execute('SELECT * FROM notes WHERE id = ?', (note_id,)).fetchone()

    if not note:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(note))


@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    with get_db() as conn:
        note = conn.execute('SELECT id FROM notes WHERE id = ?', (note_id,)).fetchone()
        if not note:
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM notes WHERE id = ?', (note_id,))
        conn.commit()
    return jsonify({'success': True})


@app.route('/api/stats', methods=['GET'])
def get_stats():
    with get_db() as conn:
        total = conn.execute('SELECT COUNT(*) as c FROM notes').fetchone()['c']
        this_month = conn.execute(
            "SELECT COUNT(*) as c FROM notes WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        ).fetchone()['c']
        moods = conn.execute(
            "SELECT mood, COUNT(*) as c FROM notes GROUP BY mood"
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
