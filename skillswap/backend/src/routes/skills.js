const express = require('express');
const { body } = require('express-validator');
const { getSkills, createSkill, deleteSkill } = require('../controllers/skillController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', getSkills);

router.post(
  '/',
  protect,
  [
    body('name').notEmpty().withMessage('Skill name is required'),
    body('category').notEmpty().withMessage('Category is required'),
    body('desc').notEmpty().withMessage('Description is required'),
    body('wantLearn').notEmpty().withMessage('Please select what you want to learn'),
  ],
  createSkill
);

router.delete('/:id', protect, deleteSkill);

module.exports = router;
