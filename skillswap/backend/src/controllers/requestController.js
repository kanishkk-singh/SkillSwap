const SwapRequest = require('../models/SwapRequest');
const Skill = require('../models/Skill');

// ── POST /api/requests/:skillId ──────────────────────────────────────────────
exports.sendRequest = async (req, res, next) => {
  try {
    const skill = await Skill.findById(req.params.skillId);
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found' });

    if (skill.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot request your own skill' });
    }

    const existing = await SwapRequest.findOne({ skill: skill._id, requester: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already requested this skill' });
    }

    const request = await SwapRequest.create({
      skill:             skill._id,
      skillName:         skill.name,
      requester:         req.user._id,
      requestedBy:       req.user.username,
      requestedByName:   req.user.fname ? `${req.user.fname} ${req.user.lname || ''}`.trim() : req.user.username,
      skillOwner:        skill.owner,
      offeredBy:         skill.offeredBy,
      offeredByUsername: skill.username,
    });

    res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/requests/incoming ───────────────────────────────────────────────
// Requests made FOR my skills
exports.getIncoming = async (req, res, next) => {
  try {
    const requests = await SwapRequest.find({ skillOwner: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/requests/sent ───────────────────────────────────────────────────
// Requests I sent
exports.getSent = async (req, res, next) => {
  try {
    const requests = await SwapRequest.find({ requester: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/requests/active ─────────────────────────────────────────────────
// Accepted requests involving me
exports.getActive = async (req, res, next) => {
  try {
    const requests = await SwapRequest.find({
      status: 'accepted',
      $or: [{ requester: req.user._id }, { skillOwner: req.user._id }],
    }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/requests/:id ────────────────────────────────────────────────────
exports.getRequest = async (req, res, next) => {
  try {
    const request = await SwapRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    // Only participants can view
    const isParticipant =
      request.requester.toString() === req.user._id.toString() ||
      request.skillOwner.toString() === req.user._id.toString();
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Not authorised' });

    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/requests/:id/status ──────────────────────────────────────────
// Accept or decline — only the skill owner can do this
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be accepted or declined' });
    }

    const request = await SwapRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    if (request.skillOwner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the skill owner can respond to requests' });
    }

    request.status = status;
    await request.save();

    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
};
