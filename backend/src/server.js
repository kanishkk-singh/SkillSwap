const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const dotenv     = require('dotenv');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const connectDB  = require('./config/db');

dotenv.config();
connectDB();

const app        = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://skill-swap-chi-nine.vercel.app',
      'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
    ],
    methods: ['GET', 'POST'],
  },
});

// ── In-memory rooms ───────────────────────────────────────────────────────────
// rooms[roomId] = [{ id, username }]
const rooms = {};
// activeCalls[roomId] = { callerId, callerName, calleeId, status: 'ringing'|'connected' }
const activeCalls = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── Join meet room ──────────────────────────────────────────────────────────
  socket.on('join-meet', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId   = roomId;
    socket.username = username;

    if (!rooms[roomId]) rooms[roomId] = [];

    // Prevent duplicates
    if (!rooms[roomId].find(u => u.id === socket.id)) {
      rooms[roomId].push({ id: socket.id, username });
    }

    // Block 3rd person from joining
    const others = rooms[roomId].filter(u => u.id !== socket.id);
    if (others.length >= 2) {
      socket.emit('room-full');
      return;
    }

    socket.emit('room-peers', others);
    socket.to(roomId).emit('peer-joined', { id: socket.id, username });
    console.log(`${username} joined room ${roomId} (${rooms[roomId].length} users)`);
  });

  // ── WebRTC signaling ────────────────────────────────────────────────────────
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer, username: socket.username });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ── Call control ────────────────────────────────────────────────────────────
  socket.on('call-rejected', ({ to }) => {
    io.to(to).emit('call-rejected');
  });

  socket.on('call-missed', ({ to }) => {
    io.to(to).emit('call-missed');
  });

  socket.on('end-call', ({ roomId, username }) => {
    socket.to(roomId).emit('peer-left', { id: socket.id, username });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
      socket.to(roomId).emit('peer-left', { id: socket.id, username: socket.username });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'https://skill-swap-chi-nine.vercel.app',
  'https://skill-swap-qxni6wrd9-kanishkk-singhs-projects.vercel.app',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/skills',   require('./routes/skills'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/stats',    require('./routes/stats'));

app.get('/', (req, res) => res.send('SkillSwap API is running 🚀'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 SkillSwap server running on port ${PORT}`));