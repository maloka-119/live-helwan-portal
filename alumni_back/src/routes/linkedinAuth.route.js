const express = require('express');
const router = express.Router();
const linkedinAuthController = require('../controllers/linkedinAuth.controller');
const authMiddleware = require('../middleware/authMiddleware');

// @desc    Get LinkedIn authorization URL
// @route   GET /alumni-portal/auth/linkedin
// @access  Public
router.get('/', linkedinAuthController.getLinkedInAuthUrl);

// @desc    Handle LinkedIn OAuth callback
// @route   GET /alumni-portal/auth/linkedin/callback
// @access  Public
router.get('/callback', linkedinAuthController.handleLinkedInCallback);

// @desc    Refresh LinkedIn access token
// @route   POST /alumni-portal/auth/linkedin/refresh
// @access  Private
router.post('/refresh', authMiddleware.protect, linkedinAuthController.refreshLinkedInToken);

// @desc    Disconnect LinkedIn account
// @route   DELETE /alumni-portal/auth/linkedin/disconnect
// @access  Private
router.delete('/disconnect', authMiddleware.protect, linkedinAuthController.disconnectLinkedIn);

// @desc    Get LinkedIn profile data
// @route   GET /alumni-portal/auth/linkedin/profile
// @access  Private
router.get('/profile', authMiddleware.protect, linkedinAuthController.getLinkedInProfile);

module.exports = router;
