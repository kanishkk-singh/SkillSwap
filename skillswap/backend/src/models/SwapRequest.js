const mongoose = require('mongoose');

const swapRequestSchema = new mongoose.Schema(
  {
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true,
    },
    skillName:  { type: String, required: true },   // denormalized

    // Requester (person sending the request)
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedBy:     { type: String, required: true },   // username
    requestedByName: { type: String, required: true },   // display name

    // Skill owner (person receiving the request)
    skillOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    offeredBy:         { type: String, required: true },   // display name
    offeredByUsername: { type: String, required: true },   // username

    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Prevent duplicate requests for same skill by same user
swapRequestSchema.index({ skill: 1, requester: 1 }, { unique: true });

module.exports = mongoose.model('SwapRequest', swapRequestSchema);
