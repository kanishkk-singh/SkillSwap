const express = require('express');
const { getReview, submitReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/:requestId',  protect, getReview);
router.post('/:requestId', protect, submitReview);

module.exports = router;
