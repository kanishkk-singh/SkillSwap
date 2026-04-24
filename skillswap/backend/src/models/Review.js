const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    swapRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SwapRequest',
      required: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedByName: { type: String, required: true },
    partnerName:    { type: String, required: true },
    skillName:      { type: String, required: true },
    overall:        { type: Number, required: true, min: 1, max: 5 },
    categories: {
      knowledge:     { type: Number, default: 0, min: 0, max: 5 },
      communication: { type: Number, default: 0, min: 0, max: 5 },
      punctuality:   { type: Number, default: 0, min: 0, max: 5 },
    },
    tags: [{ type: String }],
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// One review per reviewer per request
reviewSchema.index({ swapRequest: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
