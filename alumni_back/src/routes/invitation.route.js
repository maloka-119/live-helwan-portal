// routes/invitation.routes.js
const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitation.controller');
const { protect } = require('../middleware/authMiddleware');

// send invitation
router.post('/send', protect, invitationController.sendInvitation);

// accept invitation
router.post('/:id/accept', protect, invitationController.acceptInvitation);

// delete invitation by receiver
router.delete('/:id', protect, invitationController.deleteInvitation);

// cancel invitation by sender
router.post('/:id/cancel', protect, invitationController.cancelInvitation);

// view received invitations
router.get('/received', protect, invitationController.getReceivedInvitations);

// Get auto-group invitation status (sender_id = 1 → receiver = logged user)
router.get('/auto/status', protect, invitationController.getAutoSentInvitation);

module.exports = router;
