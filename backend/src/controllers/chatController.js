const Message = require('../models/Message');
const SwapRequest = require('../models/SwapRequest');

// Guard: user must be a participant of this swap request
const assertParticipant = (request, userId) => {
  return (
    request.requester.toString() === userId.toString() ||
    request.skillOwner.toString() === userId.toString()
  );
};

// ── GET /api/chat/:requestId ─────────────────────────────────────────────────
exports.getMessages = async (req, res, next) => {
  try {
    const request = await SwapRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!assertParticipant(request, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not a participant of this swap' });
    }
    if (request.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Chat only available for accepted swaps' });
    }

    const messages = await Message.find({ swapRequest: request._id })
      .sort({ createdAt: 1 })
      .lean();

    // Shape to match frontend { from, text, at }
    const shaped = messages.map(m => ({
      _id:  m._id,
      from: m.from,
      text: m.text,
      at:   m.createdAt,
    }));

    res.json({ success: true, messages: shaped });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/chat/:requestId ────────────────────────────────────────────────
exports.sendMessage = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text required' });
    }

    const request = await SwapRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!assertParticipant(request, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not a participant of this swap' });
    }
    if (request.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Chat only available for accepted swaps' });
    }

    const message = await Message.create({
      swapRequest: request._id,
      sender:      req.user._id,
      from:        req.user.username,
      text:        text.trim(),
    });

    res.status(201).json({
      success: true,
      message: { _id: message._id, from: message.from, text: message.text, at: message.createdAt },
    });
  } catch (err) {
    next(err);
  }
};
