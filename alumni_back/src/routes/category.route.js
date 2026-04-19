const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require admin authentication
router.use(authMiddleware.protect);
router.use(authMiddleware.admin);

// @route   GET /alumni-portal/admin/categories
// @desc    Get all post categories
// @access  Admin
router.get('/', categoryController.getAllCategories);

// @route   GET /alumni-portal/admin/categories/:id
// @desc    Get single post category
// @access  Admin
router.get('/:id', categoryController.getCategory);

// @route   GET /alumni-portal/admin/categories/:id/stats
// @desc    Get category statistics
// @access  Admin
router.get('/:id/stats', categoryController.getCategoryStats);

// @route   POST /alumni-portal/admin/categories
// @desc    Create new post category
// @access  Admin
router.post('/', categoryController.createCategory);

// @route   PUT /alumni-portal/admin/categories/:id
// @desc    Update post category
// @access  Admin
router.put('/:id', categoryController.updateCategory);

// @route   DELETE /alumni-portal/admin/categories/:id
// @desc    Delete post category
// @access  Admin
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;
