import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import multer from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// -----------------------------
// ✅ Static Files (Your Project)
// -----------------------------
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------
// ✅ File Upload Support
// -----------------------------
const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('video'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('No file uploaded');

  const ext = path.extname(file.originalname);
  const newPath = path.join('uploads', file.filename + ext);

  fs.renameSync(file.path, newPath);
  res.redirect('/simpletube.html');
});

// -----------------------------
// ✅ List uploaded videos
// -----------------------------
app.get('/videos', (req, res) => {
  const folder = path.join(__dirname, 'uploads');
  fs.readdir(folder, (err, files) => {
    if (err) return res.status(500).json({ error: 'Unable to list videos' });
    const urls = files.map(file => `/uploads/${file}`);
    res.json(urls);
  });
});

// -----------------------------
// ✅ Serve uploaded files
// -----------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -----------------------------
// ✅ WebSocket / Signaling
// -----------------------------
let hostSocket = null;
let viewerSockets = [];
let streamMeta = { title: 'Untitled Stream', description: '' };

function updateViewerCount() {
  io.emit('viewer-count', viewerSockets.length);
}

io.on('connection', (socket) => {
  socket.on('role', (role) => {
    if (role === 'host') hostSocket = socket;
    if (role === 'viewer') {
      viewerSockets.push(socket);
      updateViewerCount();
      socket.emit('stream-meta', streamMeta);
    }
  });

  socket.on('set-stream-meta', (meta) => {
    streamMeta = meta;
    io.emit('stream-meta', streamMeta);
  });

  socket.on('ready-for-offer', () => {
    if (hostSocket) hostSocket.emit('ready-for-offer', { viewerId: socket.id });
  });

  socket.on('signal', (data) => {
    if (data.to) {
      io.to(data.to).emit('signal', { ...data, to: undefined });
    } else if (socket === hostSocket) {
      viewerSockets.forEach(viewer => viewer.emit('signal', data));
    } else if (hostSocket) {
      hostSocket.emit('signal', { ...data, from: socket.id });
    }
  });

  socket.on('chat', (msg) => {
    io.emit('chat', msg);
  });

  socket.on('emoji', (emoji) => {
    io.emit('emoji', emoji);
  });

  socket.on('disconnect', () => {
    if (socket === hostSocket) hostSocket = null;
    viewerSockets = viewerSockets.filter(s => s !== socket);
    updateViewerCount();
  });
});

// -----------------------------
// ✅ Start Server
// -----------------------------
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
