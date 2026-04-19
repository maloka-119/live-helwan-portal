const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const chatController = require('../controllers/chat.controller');
const fileUploadController = require('../controllers/fileUpload.controller');

// Apply rate limiting to message routes
router.use('/messages', chatController.messageRateLimit);

// @desc    Get or create chat between two users
// @route   POST /alumni-portal/chat/conversation
// @access  Private
router.post('/conversation', authMiddleware.protect, chatController.getOrCreateChat);

// @desc    Get user's chat list
// @route   GET /alumni-portal/chat/conversations
// @access  Private
router.get('/conversations', authMiddleware.protect, chatController.getChatList);

// @desc    Get messages for a chat with pagination
// @route   GET /alumni-portal/chat/:chatId/messages
// @access  Private
router.get('/:chatId/messages', authMiddleware.protect, chatController.getChatMessages);

// @desc    Send a text message
// @route   POST /alumni-portal/chat/:chatId/messages
// @access  Private
router.post('/:chatId/messages', authMiddleware.protect, chatController.sendMessage);

// @desc    Send an image message
// @route   POST /alumni-portal/chat/:chatId/messages/image
// @access  Private
router.post('/:chatId/messages/image', authMiddleware.protect, chatController.uploadRateLimit, chatController.chatUpload.single('image'), chatController.sendImageMessage);

// @desc    Send a file message
// @route   POST /alumni-portal/chat/:chatId/messages/file
// @access  Private
router.post('/:chatId/messages/file', authMiddleware.protect, chatController.uploadRateLimit, chatController.chatUpload.single('file'), chatController.sendFileMessage);

// @desc    Mark messages as read
// @route   PUT /alumni-portal/chat/:chatId/read
// @access  Private
router.put('/:chatId/read', authMiddleware.protect, chatController.markAsRead);

// @desc    Get chat attachments
// @route   GET /alumni-portal/chat/:chatId/attachments
// @access  Private
router.get('/:chatId/attachments', authMiddleware.protect, chatController.getChatAttachments);

// @desc    Download message attachment
// @route   GET /alumni-portal/chat/messages/:messageId/download
// @access  Private
router.get('/messages/:messageId/download', authMiddleware.protect, chatController.downloadAttachment);


// @desc    Upload file attachment for chat
// @route   POST /alumni-portal/chat/:chatId/upload
// @access  Private
router.post('/:chatId/upload', authMiddleware.protect, chatController.uploadRateLimit, fileUploadController.uploadChatFile);

// @desc    Edit a message
// @route   PUT /alumni-portal/chat/messages/:messageId
// @access  Private
router.put('/messages/:messageId', authMiddleware.protect, chatController.editMessage);

// @desc    Delete a message (soft delete)
// @route   DELETE /alumni-portal/chat/messages/:messageId
// @access  Private
router.delete('/messages/:messageId', authMiddleware.protect, chatController.deleteMessage);

// @desc    Block a user
// @route   POST /alumni-portal/chat/block
// @access  Private
router.post('/block', authMiddleware.protect, chatController.blockUser);

// @desc    Unblock a user
// @route   DELETE /alumni-portal/chat/block/:userId
// @access  Private
router.delete('/block/:userId', authMiddleware.protect, chatController.unblockUser);

// @desc    Get blocked users list
// @route   GET /alumni-portal/chat/blocked
// @access  Private
router.get('/blocked', authMiddleware.protect, chatController.getBlockedUsers);

// @desc    Report a user or message
// @route   POST /alumni-portal/chat/report
// @access  Private
router.post('/report', authMiddleware.protect, chatController.reportUser);

// @desc    Delete uploaded file
// @route   DELETE /alumni-portal/chat/files/:publicId
// @access  Private
router.delete('/files/:publicId', authMiddleware.protect, fileUploadController.deleteChatFile);

// @desc    Get file info
// @route   GET /alumni-portal/chat/files/:publicId/info
// @access  Private
router.get('/files/:publicId/info', authMiddleware.protect, fileUploadController.getFileInfo);

// @desc    Get user presence status
// @route   GET /alumni-portal/chat/presence/:userId
// @access  Private
router.get('/presence/:userId', authMiddleware.protect, chatController.getUserPresence);

// @desc    Get online users
// @route   GET /alumni-portal/chat/online-users
// @access  Private
router.get('/online-users', authMiddleware.protect, chatController.getOnlineUsers);

// @desc    Get unread counts for all chats
// @route   GET /alumni-portal/chat/unread-counts
// @access  Private
router.get('/unread-counts', authMiddleware.protect, chatController.getUnreadCounts);

// @desc    Search messages in a chat
// @route   GET /alumni-portal/chat/:chatId/search
// @access  Private
router.get('/:chatId/search', authMiddleware.protect, chatController.searchMessages);

// @desc    Get message statistics
// @route   GET /alumni-portal/chat/stats
// @access  Private
router.get('/stats', authMiddleware.protect, chatController.getMessageStats);

// @desc    Get moderation dashboard (admin only)
// @route   GET /alumni-portal/chat/moderation/dashboard
// @access  Admin
router.get('/moderation/dashboard', authMiddleware.protect, authMiddleware.admin, chatController.getModerationDashboard);

// @desc    Update report status (admin only)
// @route   PUT /alumni-portal/chat/moderation/reports/:reportId
// @access  Admin
router.put('/moderation/reports/:reportId', authMiddleware.protect, authMiddleware.admin, chatController.updateReportStatus);

module.exports = router;
