const express = require('express');
const {
  sendRequest, getIncoming, getSent, getActive, getRequest, updateStatus,
} = require('../controllers/requestController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/incoming', protect, getIncoming);
router.get('/sent',     protect, getSent);
router.get('/active',   protect, getActive);
router.get('/:id',      protect, getRequest);

router.post('/:skillId',        protect, sendRequest);
router.patch('/:id/status',     protect, updateStatus);

module.exports = router;
