// server.js (최종 수정: 자동 회원가입 포함)
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html'); 
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// DB 경로 설정
const diskPath = '/var/data';
let dbPath;

if (fs.existsSync(diskPath)) {
    console.log('📢 Render Disk 사용');
    dbPath = path.join(diskPath, 'database.sqlite');
} else {
    console.log('📢 로컬 개발 환경 사용');
    dbPath = path.resolve(__dirname, 'database.sqlite');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB 연결 실패:', err.message);
    else {
        console.log(`DB 연결됨: ${dbPath}`);
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            author TEXT,
            category TEXT,
            image TEXT,
            date TEXT
        )`);
    });
}

// ==========================================
// [핵심 수정] 로그인 + 자동 회원가입 통합
// ==========================================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // 1. 먼저 유저가 있는지 확인
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ message: "DB 오류" });

        if (user) {
            // 2. 유저가 있으면 -> 비밀번호 체크
            if (user.password === password) {
                res.json({ message: "로그인 성공!", user: user.email });
            } else {
                res.status(400).json({ message: "비밀번호가 틀렸습니다." });
            }
        } else {
            // 3. 유저가 없으면 -> 자동으로 회원가입 시키고 로그인 성공 처리
            db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], function(err) {
                if (err) return res.status(500).json({ message: "회원가입 실패" });
                console.log(`새 유저 자동 가입: ${email}`);
                res.status(201).json({ message: "환영합니다! 새 계정으로 로그인되었습니다.", user: email });
            });
        }
    });
});

// 기존 게시물 업로드
app.post('/api/posts', (req, res) => {
    const { title, content, author, category, image } = req.body;
    const date = new Date().toISOString();

    const sql = 'INSERT INTO posts (title, content, author, category, image, date) VALUES (?, ?, ?, ?, ?, ?)';
    const params = [title, content, author, category || 'general', image || null, date];

    db.run(sql, params, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "업로드 실패" });
        }
        const newPost = { id: this.lastID, title, content, author, category, image, date };
        res.status(201).json({ message: "업로드 성공", post: newPost });
    });
});

// 게시물 목록 조회
app.get('/api/posts', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ message: "조회 실패" });
        res.json(rows);
    });
});

// 게시물 삭제
app.delete('/api/posts/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM posts WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ message: "삭제 오류" });
        res.json({ message: "삭제 성공" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});