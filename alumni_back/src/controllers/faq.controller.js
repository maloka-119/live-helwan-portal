const { FAQ, User } = require("../models");
const asyncHandler = require("express-async-handler");
const { Op } = require("sequelize");
const checkStaffPermission = require("../utils/permissionChecker");
const { logger, securityLogger } = require("../utils/logger");

/**
 * Helper function to truncate text if it's too long for logging
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Truncated text
 */
const truncateText = (text, maxLength = 500) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

/**
 * Get all active FAQs for public access
 * @route GET /alumni-portal/faqs
 * @access Public
 */
const getAllFAQs = asyncHandler(async (req, res) => {
  const { category, search, sort = "order", lang = "en" } = req.query;

  logger.info("Getting all FAQs (public)", {
    category,
    search: !!search,
    sort,
    lang,
  });

  let whereClause = { is_active: true };
  let orderClause = [
    ["order", "ASC"],
    ["created-at", "ASC"],
  ];

  // Filter by category
  if (category) {
    whereClause.category = category;
  }

  // Search functionality based on language
  if (search) {
    if (lang === "ar") {
      whereClause[Op.or] = [
        { question_ar: { [Op.iLike]: `%${search}%` } },
        { answer_ar: { [Op.iLike]: `%${search}%` } },
      ];
    } else {
      whereClause[Op.or] = [
        { question_en: { [Op.iLike]: `%${search}%` } },
        { answer_en: { [Op.iLike]: `%${search}%` } },
      ];
    }
  }

  // Sorting options
  if (sort === "date") {
    orderClause = [["created-at", "DESC"]];
  } else if (sort === "category") {
    orderClause = [
      ["category", "ASC"],
      ["order", "ASC"],
    ];
  }

  const faqs = await FAQ.findAll({
    where: whereClause,
    order: orderClause,
    include: [
      {
        model: User,
        as: "creator",
        attributes: ["id", "first-name", "last-name"],
      },
    ],
  });

  // Format response based on language preference
  const formattedFAQs = faqs.map((faq) => ({
    faq_id: faq.faq_id,
    question: lang === "ar" ? faq.question_ar : faq.question_en,
    answer: lang === "ar" ? faq.answer_ar : faq.answer_en,
    question_ar: faq.question_ar,
    question_en: faq.question_en,
    answer_ar: faq.answer_ar,
    answer_en: faq.answer_en,
    order: faq.order,
    category: faq.category,
    is_active: faq.is_active,
    created_by: faq.created_by,
    updated_by: faq.updated_by,
    "created-at": faq["created-at"],
    "updated-at": faq["updated-at"],
    creator: faq.creator,
  }));

  logger.info("FAQs retrieved successfully (public)", {
    count: formattedFAQs.length,
    category: category || "all",
    lang,
  });

  res.status(200).json({
    success: true,
    count: formattedFAQs.length,
    data: formattedFAQs,
  });
});

/**
 * Get all FAQs for admin (includes inactive ones)
 * @route GET /alumni-portal/admin/faqs
 * @access Admin & Staff
 */
const getAllFAQsAdmin = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const {
      category,
      search,
      is_active,
      sort = "order",
      lang = "en",
    } = req.query;

    logger.info("Getting all FAQs (admin)", {
      userId: user?.id,
      userType: user?.["user-type"],
      category,
      search: !!search,
      is_active,
      sort,
      lang,
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized access to admin FAQs", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "view"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ view", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to view FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    let whereClause = {};
    let orderClause = [
      ["order", "ASC"],
      ["created-at", "ASC"],
    ];

    // Filter by category
    if (category) {
      whereClause.category = category;
    }

    // Filter by active status
    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    // Search functionality based on language
    if (search) {
      if (lang === "ar") {
        whereClause[Op.or] = [
          { question_ar: { [Op.iLike]: `%${search}%` } },
          { answer_ar: { [Op.iLike]: `%${search}%` } },
        ];
      } else {
        whereClause[Op.or] = [
          { question_en: { [Op.iLike]: `%${search}%` } },
          { answer_en: { [Op.iLike]: `%${search}%` } },
        ];
      }
    }

    // Sorting options
    if (sort === "date") {
      orderClause = [["created-at", "DESC"]];
    } else if (sort === "category") {
      orderClause = [
        ["category", "ASC"],
        ["order", "ASC"],
      ];
    }

    const faqs = await FAQ.findAll({
      where: whereClause,
      order: orderClause,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "first-name", "last-name"],
        },
        {
          model: User,
          as: "updater",
          attributes: ["id", "first-name", "last-name"],
        },
      ],
    });

    // Format response with both languages
    const formattedFAQs = faqs.map((faq) => ({
      ...faq.toJSON(),
      question: lang === "ar" ? faq.question_ar : faq.question_en,
      answer: lang === "ar" ? faq.answer_ar : faq.answer_en,
    }));

    logger.info("FAQs retrieved successfully (admin)", {
      userId: user.id,
      count: formattedFAQs.length,
      category: category || "all",
      is_active: is_active || "all",
      lang,
    });

    res.status(200).json({
      success: true,
      count: formattedFAQs.length,
      data: formattedFAQs,
    });
  } catch (error) {
    logger.error("Error in getAllFAQsAdmin", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Get a single FAQ by ID
 * @route GET /alumni-portal/faqs/:id
 * @access Public
 */
const getFAQ = asyncHandler(async (req, res) => {
  const { lang = "en" } = req.query;
  const { id } = req.params;

  logger.info("Getting single FAQ", { faqId: id, lang });

  const faq = await FAQ.findOne({
    where: {
      faq_id: id,
      is_active: true,
    },
    include: [
      {
        model: User,
        as: "creator",
        attributes: ["id", "first-name", "last-name"],
      },
    ],
  });

  if (!faq) {
    logger.warn("FAQ not found", { faqId: id });
    return res.status(404).json({
      success: false,
      message: "FAQ not found",
    });
  }

  // Format response based on language preference
  const formattedFAQ = {
    ...faq.toJSON(),
    question: lang === "ar" ? faq.question_ar : faq.question_en,
    answer: lang === "ar" ? faq.answer_ar : faq.answer_en,
  };

  logger.info("FAQ retrieved successfully", { faqId: id, lang });

  res.status(200).json({
    success: true,
    data: formattedFAQ,
  });
});

/**
 * Create a new FAQ
 * @route POST /alumni-portal/admin/faqs
 * @access Admin & Staff
 */
const createFAQ = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const {
      question_ar,
      question_en,
      answer_ar,
      answer_en,
      order,
      category,
      is_active,
    } = req.body;

    logger.info("Creating new FAQ", {
      userId: user?.id,
      userType: user?.["user-type"],
      category,
      hasQuestionAr: !!question_ar,
      hasQuestionEn: !!question_en,
      hasAnswerAr: !!answer_ar,
      hasAnswerEn: !!answer_en,
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized FAQ creation attempt", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "add"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ creation", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to create FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    // Validate required fields for both languages
    if (!question_ar || !question_en || !answer_ar || !answer_en) {
      logger.warn("Missing required fields for FAQ creation", {
        userId: user.id,
        missingFields: {
          question_ar: !question_ar,
          question_en: !question_en,
          answer_ar: !answer_ar,
          answer_en: !answer_en,
        },
      });
      return res.status(400).json({
        success: false,
        message: "Question and answer in both Arabic and English are required",
      });
    }

    // Check if order is provided, otherwise get the next order number
    let faqOrder = order;
    if (faqOrder === undefined || faqOrder === null) {
      const lastFAQ = await FAQ.findOne({
        order: [["order", "DESC"]],
      });
      faqOrder = lastFAQ ? lastFAQ.order + 1 : 1;
    }

    const faq = await FAQ.create({
      question_ar: question_ar.trim(),
      question_en: question_en.trim(),
      answer_ar: answer_ar.trim(),
      answer_en: answer_en.trim(),
      order: faqOrder,
      category: category?.trim() || "General",
      is_active: is_active !== undefined ? is_active : true,
      created_by: user.id,
      "created-at": new Date(),
      "updated-at": new Date(),
    });

    // Fetch the created FAQ with creator info
    const createdFAQ = await FAQ.findByPk(faq.faq_id, {
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "first-name", "last-name"],
        },
      ],
    });

    // Log FAQ creation with full content
    logger.info("FAQ created successfully", {
      faqId: createdFAQ.faq_id,
      userId: user.id,
      userType: user["user-type"],
      category: createdFAQ.category,
      order: createdFAQ.order,
      is_active: createdFAQ.is_active,
      question_ar: truncateText(createdFAQ.question_ar),
      question_en: truncateText(createdFAQ.question_en),
      answer_ar: truncateText(createdFAQ.answer_ar),
      answer_en: truncateText(createdFAQ.answer_en),
      full_content: {
        question_ar: createdFAQ.question_ar,
        question_en: createdFAQ.question_en,
        answer_ar: createdFAQ.answer_ar,
        answer_en: createdFAQ.answer_en,
      },
    });

    res.status(201).json({
      success: true,
      data: createdFAQ,
    });
  } catch (error) {
    logger.error("Error in createFAQ", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Update an existing FAQ
 * @route PUT /alumni-portal/admin/faqs/:id
 * @access Admin & Staff
 */
const updateFAQ = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const {
      question_ar,
      question_en,
      answer_ar,
      answer_en,
      order,
      category,
      is_active,
    } = req.body;

    logger.info("Updating FAQ", {
      userId: user?.id,
      userType: user?.["user-type"],
      faqId: id,
      fieldsToUpdate: {
        question_ar: !!question_ar,
        question_en: !!question_en,
        answer_ar: !!answer_ar,
        answer_en: !!answer_en,
        order: order !== undefined,
        category: !!category,
        is_active: is_active !== undefined,
      },
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized FAQ update attempt", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ update", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to update FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    const faq = await FAQ.findByPk(id);

    if (!faq) {
      logger.warn("FAQ not found for update", { faqId: id });
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    // Save old version before update
    const oldVersion = {
      question_ar: faq.question_ar,
      question_en: faq.question_en,
      answer_ar: faq.answer_ar,
      answer_en: faq.answer_en,
      order: faq.order,
      category: faq.category,
      is_active: faq.is_active,
    };

    // Update fields
    const updateData = {
      "updated-by": user.id,
      "updated-at": new Date(),
    };

    if (question_ar !== undefined) updateData.question_ar = question_ar.trim();
    if (question_en !== undefined) updateData.question_en = question_en.trim();
    if (answer_ar !== undefined) updateData.answer_ar = answer_ar.trim();
    if (answer_en !== undefined) updateData.answer_en = answer_en.trim();
    if (order !== undefined) updateData.order = order;
    if (category !== undefined) updateData.category = category.trim();
    if (is_active !== undefined) updateData.is_active = is_active;

    await faq.update(updateData);

    // Fetch updated FAQ with creator and updater info
    const updatedFAQ = await FAQ.findByPk(faq.faq_id, {
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "first-name", "last-name"],
        },
        {
          model: User,
          as: "updater",
          attributes: ["id", "first-name", "last-name"],
        },
      ],
    });

    // Save new version
    const newVersion = {
      question_ar: updatedFAQ.question_ar,
      question_en: updatedFAQ.question_en,
      answer_ar: updatedFAQ.answer_ar,
      answer_en: updatedFAQ.answer_en,
      order: updatedFAQ.order,
      category: updatedFAQ.category,
      is_active: updatedFAQ.is_active,
    };

    // Log the update with full content of old and new versions
    logger.info("FAQ updated successfully", {
      faqId: updatedFAQ.faq_id,
      userId: user.id,
      userType: user["user-type"],
      changes: {
        question_ar: oldVersion.question_ar !== newVersion.question_ar,
        question_en: oldVersion.question_en !== newVersion.question_en,
        answer_ar: oldVersion.answer_ar !== newVersion.answer_ar,
        answer_en: oldVersion.answer_en !== newVersion.answer_en,
        order: oldVersion.order !== newVersion.order,
        category: oldVersion.category !== newVersion.category,
        is_active: oldVersion.is_active !== newVersion.is_active,
      },
      old_version: {
        question_ar: truncateText(oldVersion.question_ar),
        question_en: truncateText(oldVersion.question_en),
        answer_ar: truncateText(oldVersion.answer_ar),
        answer_en: truncateText(oldVersion.answer_en),
        order: oldVersion.order,
        category: oldVersion.category,
        is_active: oldVersion.is_active,
      },
      new_version: {
        question_ar: truncateText(newVersion.question_ar),
        question_en: truncateText(newVersion.question_en),
        answer_ar: truncateText(newVersion.answer_ar),
        answer_en: truncateText(newVersion.answer_en),
        order: newVersion.order,
        category: newVersion.category,
        is_active: newVersion.is_active,
      },
      full_content_changes: {
        old_content: {
          question_ar: oldVersion.question_ar,
          question_en: oldVersion.question_en,
          answer_ar: oldVersion.answer_ar,
          answer_en: oldVersion.answer_en,
        },
        new_content: {
          question_ar: newVersion.question_ar,
          question_en: newVersion.question_en,
          answer_ar: newVersion.answer_ar,
          answer_en: newVersion.answer_en,
        },
      },
    });

    res.status(200).json({
      success: true,
      data: updatedFAQ,
    });
  } catch (error) {
    logger.error("Error in updateFAQ", {
      userId: req.user?.id,
      faqId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Soft delete FAQ (mark as inactive)
 * @route DELETE /alumni-portal/admin/faqs/:id
 * @access Admin & Staff
 */
const deleteFAQ = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    logger.info("Soft deleting FAQ", {
      userId: user?.id,
      userType: user?.["user-type"],
      faqId: id,
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized FAQ soft delete attempt", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "delete"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ soft delete", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to delete FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    const faq = await FAQ.findByPk(id);

    if (!faq) {
      logger.warn("FAQ not found for soft delete", { faqId: id });
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    // Save old version before deletion
    const oldVersion = {
      question_ar: faq.question_ar,
      question_en: faq.question_en,
      answer_ar: faq.answer_ar,
      answer_en: faq.answer_en,
      order: faq.order,
      category: faq.category,
      is_active: faq.is_active,
    };

    // Soft delete - mark as inactive
    await faq.update({
      is_active: false,
      "updated-by": user.id,
      "updated-at": new Date(),
    });

    // Log soft delete with full content
    logger.info("FAQ soft deleted successfully", {
      faqId: id,
      userId: user.id,
      userType: user["user-type"],
      old_version: {
        question_ar: truncateText(oldVersion.question_ar),
        question_en: truncateText(oldVersion.question_en),
        answer_ar: truncateText(oldVersion.answer_ar),
        answer_en: truncateText(oldVersion.answer_en),
        order: oldVersion.order,
        category: oldVersion.category,
      },
      full_content: {
        question_ar: oldVersion.question_ar,
        question_en: oldVersion.question_en,
        answer_ar: oldVersion.answer_ar,
        answer_en: oldVersion.answer_en,
      },
    });

    res.status(200).json({
      success: true,
      message: "FAQ deleted successfully (marked as inactive)",
    });
  } catch (error) {
    logger.error("Error in deleteFAQ", {
      userId: req.user?.id,
      faqId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Hard delete FAQ (permanent removal)
 * @route DELETE /alumni-portal/admin/faqs/:id/hard
 * @access Admin & Staff
 */
const hardDeleteFAQ = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    logger.info("Hard deleting FAQ", {
      userId: user?.id,
      userType: user?.["user-type"],
      faqId: id,
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized FAQ hard delete attempt", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "delete"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ hard delete", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to delete FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    const faq = await FAQ.findByPk(id);

    if (!faq) {
      logger.warn("FAQ not found for hard delete", { faqId: id });
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    // Save data before permanent deletion
    const deletedData = {
      faq_id: faq.faq_id,
      question_ar: faq.question_ar,
      question_en: faq.question_en,
      answer_ar: faq.answer_ar,
      answer_en: faq.answer_en,
      order: faq.order,
      category: faq.category,
      is_active: faq.is_active,
      created_by: faq.created_by,
      created_at: faq["created-at"],
    };

    await faq.destroy();

    // Log permanent deletion with full content
    logger.info("FAQ hard deleted permanently", {
      faqId: id,
      userId: user.id,
      userType: user["user-type"],
      deleted_data: {
        question_ar: truncateText(deletedData.question_ar),
        question_en: truncateText(deletedData.question_en),
        answer_ar: truncateText(deletedData.answer_ar),
        answer_en: truncateText(deletedData.answer_en),
        order: deletedData.order,
        category: deletedData.category,
        created_by: deletedData.created_by,
        created_at: deletedData.created_at,
      },
      full_content: {
        question_ar: deletedData.question_ar,
        question_en: deletedData.question_en,
        answer_ar: deletedData.answer_ar,
        answer_en: deletedData.answer_en,
      },
    });

    res.status(200).json({
      success: true,
      message: "FAQ permanently deleted",
    });
  } catch (error) {
    logger.error("Error in hardDeleteFAQ", {
      userId: req.user?.id,
      faqId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Get all FAQ categories
 * @route GET /alumni-portal/faqs/categories
 * @access Public
 */
const getFAQCategories = asyncHandler(async (req, res) => {
  logger.info("Getting FAQ categories");

  const categories = await FAQ.findAll({
    where: { is_active: true },
    attributes: ["category"],
    group: ["category"],
    order: [["category", "ASC"]],
  });

  const categoryList = categories.map((faq) => faq.category);

  logger.info("FAQ categories retrieved successfully", {
    count: categoryList.length,
  });

  res.status(200).json({
    success: true,
    data: categoryList,
  });
});

/**
 * Reorder FAQs by updating their display order
 * @route PUT /alumni-portal/admin/faqs/reorder
 * @access Admin & Staff
 */
const reorderFAQs = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { faq_orders } = req.body; // Array of { faq_id, order }

    logger.info("Reordering FAQs", {
      userId: user?.id,
      userType: user?.["user-type"],
      faqCount: faq_orders?.length || 0,
    });

    // 1. Define allowed user types
    const allowedUserTypes = ["admin", "staff"];

    // 2. Check if user type is allowed
    if (!user || !allowedUserTypes.includes(user["user-type"])) {
      logger.warn("Unauthorized FAQ reorder attempt", {
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // 3. Check staff permissions
    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "FAQ management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("Staff permission denied for FAQ reorder", {
          userId: user.id,
          requiredPermission: "FAQ management",
        });
        return res.status(403).json({
          success: false,
          message: "Access denied. You don't have permission to reorder FAQs.",
        });
      }
    }

    // 4. Continue for admin or authorized staff
    if (!Array.isArray(faq_orders)) {
      logger.warn("Invalid faq_orders format", {
        userId: user.id,
        faq_orders_type: typeof faq_orders,
      });
      return res.status(400).json({
        success: false,
        message: "faq_orders must be an array",
      });
    }

    // Save old order before update
    const faqIds = faq_orders.map((order) => order.faq_id);
    const oldOrders = await FAQ.findAll({
      where: { faq_id: { [Op.in]: faqIds } },
      attributes: ["faq_id", "order", "question_en", "question_ar"],
    });

    const oldOrderMap = {};
    oldOrders.forEach((faq) => {
      oldOrderMap[faq.faq_id] = {
        order: faq.order,
        question_en: faq.question_en,
        question_ar: faq.question_ar,
      };
    });

    // Update orders in transaction
    const transaction = await FAQ.sequelize.transaction();

    try {
      for (const { faq_id, order } of faq_orders) {
        await FAQ.update(
          {
            order: order,
            "updated-by": user.id,
            "updated-at": new Date(),
          },
          {
            where: { faq_id },
            transaction,
          }
        );
      }

      await transaction.commit();

      // Log reorder operation with full content
      const reorderLog = faq_orders.map(({ faq_id, order }) => ({
        faq_id,
        old_order: oldOrderMap[faq_id]?.order || "unknown",
        new_order: order,
        question_en: truncateText(
          oldOrderMap[faq_id]?.question_en || "unknown"
        ),
        question_ar: truncateText(
          oldOrderMap[faq_id]?.question_ar || "unknown"
        ),
        full_content: {
          question_en: oldOrderMap[faq_id]?.question_en,
          question_ar: oldOrderMap[faq_id]?.question_ar,
        },
      }));

      logger.info("FAQs reordered successfully", {
        userId: user.id,
        userType: user["user-type"],
        reordered_count: faq_orders.length,
        changes: reorderLog,
      });

      res.status(200).json({
        success: true,
        message: "FAQs reordered successfully",
      });
    } catch (error) {
      await transaction.rollback();
      logger.error("Transaction error in reorderFAQs", {
        userId: user.id,
        error: error.message,
      });
      throw error;
    }
  } catch (error) {
    logger.error("Error in reorderFAQs", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = {
  getAllFAQs,
  getAllFAQsAdmin,
  getFAQ,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  hardDeleteFAQ,
  getFAQCategories,
  reorderFAQs,
};
