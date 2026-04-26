const express = require('express');
const { getMessages, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/:requestId',  protect, getMessages);
router.post('/:requestId', protect, sendMessage);

module.exports = router;
