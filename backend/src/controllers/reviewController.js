const Review = require('../models/Review');
const SwapRequest = require('../models/SwapRequest');

// ── GET /api/reviews/:requestId ──────────────────────────────────────────────
exports.getReview = async (req, res, next) => {
  try {
    const review = await Review.findOne({
      swapRequest: req.params.requestId,
      reviewer:    req.user._id,
    }).lean();

    res.json({ success: true, review: review || null });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/reviews/:requestId ─────────────────────────────────────────────
exports.submitReview = async (req, res, next) => {
  try {
    const { overall, categories, tags, text } = req.body;

    if (!overall || overall < 1 || overall > 5) {
      return res.status(400).json({ success: false, message: 'Please select an overall star rating.' });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Please write a short review.' });
    }

    const request = await SwapRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const isParticipant =
      request.requester.toString() === req.user._id.toString() ||
      request.skillOwner.toString() === req.user._id.toString();
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Not a participant' });

    // Check already reviewed
    const existing = await Review.findOne({ swapRequest: request._id, reviewer: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this swap.' });
    }

    const isSender = request.requester.toString() === req.user._id.toString();
    const partnerName = isSender ? request.offeredBy : request.requestedByName;

    const review = await Review.create({
      swapRequest:    request._id,
      reviewer:       req.user._id,
      reviewedByName: req.user.fname ? `${req.user.fname} ${req.user.lname || ''}`.trim() : req.user.username,
      partnerName,
      skillName: request.skillName,
      overall,
      categories: categories || {},
      tags:       tags || [],
      text:       text.trim(),
    });

    res.status(201).json({ success: true, review });
  } catch (err) {
    next(err);
  }
};
