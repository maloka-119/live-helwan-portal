const express = require('express');
const router = express.Router();

// Import category routes
const categoryRoutes = require('./category.route');
const faqRoutes = require('./admin-faq.route');

// Mount category routes under /categories
router.use('/categories', categoryRoutes);

// Mount FAQ routes under /faqs
router.use('/faqs', faqRoutes);

module.exports = router;
