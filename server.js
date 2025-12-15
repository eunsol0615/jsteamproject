// server.js (Render Disk 적용 버전)
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs'); // [추가] 파일 시스템 모듈 가져오기
const app = express();

// 현재 폴더에 있는 html, css, js 파일들을 그대로 보여주라는 뜻입니다.
app.use(express.static(__dirname));

// 만약 접속했을 때 바로 index.html을 보여주고 싶다면 아래 코드도 추가하세요.
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html'); 
});

// 용량 및 CORS 설정
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// [중요 수정 부분] SQLite 데이터베이스 파일 경로 설정
// Render Disk 마운트 경로: /var/data
const diskPath = '/var/data';
let dbPath;

// /var/data 폴더가 존재하면(Render 배포 환경) 거기를 사용하고,
// 없으면(로컬 개발 환경) 현재 프로젝트 폴더를 사용합니다.
if (fs.existsSync(diskPath)) {
    console.log('📢 Render Disk 영구 저장소를 사용합니다.');
    dbPath = path.join(diskPath, 'database.sqlite');
} else {
    console.log('📢 로컬 개발 환경 저장소를 사용합니다.');
    dbPath = path.resolve(__dirname, 'database.sqlite');
}

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('데이터베이스 연결 실패:', err.message);
    } else {
        console.log(`SQLite 데이터베이스에 연결되었습니다. (경로: ${dbPath})`);
        initializeTables(); // 연결 성공하면 테이블 만들기
    }
});

// [초기화] 테이블이 없으면 자동으로 생성하는 함수
function initializeTables() {
    db.serialize(() => {
        // 1. 유저 테이블 생성
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT
        )`);

        // 2. 게시물 테이블 생성
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            author TEXT,
            category TEXT,
            image TEXT,
            date TEXT
        )`);
        console.log('테이블 준비 완료');
    });
}

// 1. 회원가입
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    
    // 이미 있는 이메일인지 확인
    db.get('SELECT email FROM users WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ message: "DB 오류" });
        if (row) return res.status(400).json({ message: "이미 존재하는 이메일입니다." });

        // 저장
        db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], function(err) {
            if (err) return res.status(500).json({ message: "회원가입 실패" });
            res.status(201).json({ message: "회원가입 성공!" });
        });
    });
});

// 2. 로그인
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, row) => {
        if (err) return res.status(500).json({ message: "DB 오류" });
        if (!row) return res.status(400).json({ message: "이메일 또는 비밀번호가 틀렸습니다." });
        
        res.json({ message: "로그인 성공!", user: row.email });
    });
});

// 3. 게시물 업로드
app.post('/api/posts', (req, res) => {
    const { title, content, author, category, image } = req.body;
    const date = new Date().toISOString(); // 날짜를 문자열로 저장

    const sql = 'INSERT INTO posts (title, content, author, category, image, date) VALUES (?, ?, ?, ?, ?, ?)';
    const params = [title, content, author, category || 'general', image || null, date];

    db.run(sql, params, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "업로드 실패" });
        }
        
        // 방금 저장한 게시물 데이터를 다시 만들어서 응답해줌
        const newPost = { id: this.lastID, title, content, author, category, image, date };
        console.log('새 게시물 저장됨(DB):', title);
        res.status(201).json({ message: "게시물 업로드 성공", post: newPost });
    });
});

// 4. 게시물 목록 조회
app.get('/api/posts', (req, res) => {
    // 최신글(id 역순) 정렬해서 가져오기
    db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "조회 실패" });
        }
        res.json(rows);
    });
});

// 5. 게시물 삭제 기능 (DELETE /api/posts/:id)
app.delete('/api/posts/:id', (req, res) => {
    const id = req.params.id;
    
    // DB에서 해당 ID의 게시물 삭제
    db.run('DELETE FROM posts WHERE id = ?', [id], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "삭제 중 오류 발생" });
        }
        console.log(`게시물 삭제됨 (ID: ${id})`);
        res.json({ message: "삭제 성공" });
    });
});

// ✅ 포트 번호 설정
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});