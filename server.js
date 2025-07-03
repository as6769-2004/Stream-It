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
// ✅ Middleware
// -----------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// -----------------------------
// ✅ Video Upload Handling
// -----------------------------
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const ext = path.extname(req.file.originalname);
  const newPath = path.join('uploads', req.file.filename + ext);

  fs.rename(req.file.path, newPath, (err) => {
    if (err) {
      console.error('Rename failed:', err);
      return res.status(500).send('File processing error');
    }
    res.redirect('/simpletube.html');
  });
});

app.get('/videos', (req, res) => {
  const uploadDir = path.join(__dirname, 'uploads');

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('Failed to read uploads:', err);
      return res.status(500).json({ error: 'Unable to list videos' });
    }

    const urls = files.map(file => `/uploads/${file}`);
    res.json(urls);
  });
});

// -----------------------------
// ✅ WebSocket Signaling
// -----------------------------
let hostSocket = null;
let viewerSockets = [];
let streamMeta = { title: 'Untitled Stream', description: '' };

function updateViewerCount() {
  io.emit('viewer-count', viewerSockets.length);
}

io.on('connection', (socket) => {
  socket.on('role', (role) => {
    if (role === 'host') {
      hostSocket = socket;
    } else if (role === 'viewer') {
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
    if (hostSocket) {
      hostSocket.emit('ready-for-offer', { viewerId: socket.id });
    }
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

  socket.on('chat', (msg) => io.emit('chat', msg));
  socket.on('emoji', (emoji) => io.emit('emoji', emoji));

  socket.on('disconnect', () => {
    if (socket === hostSocket) {
      hostSocket = null;
    }
    viewerSockets = viewerSockets.filter(v => v !== socket);
    updateViewerCount();
  });
});

// -----------------------------
// ✅ Fallback Route (optional)
// -----------------------------
// app.get('*', (req, res) => {
//   res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
// });

// -----------------------------
// ✅ Start Server
// -----------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
