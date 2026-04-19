const { PostCategory, Post } = require("../models");
const asyncHandler = require("express-async-handler");
const { Op } = require("sequelize");

/**
 * Get all post categories
 * @route GET /alumni-portal/admin/categories
 * @access Admin
 */
const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await PostCategory.findAll({
    order: [["name", "ASC"]],
  });

  res.status(200).json({
    success: true,
    count: categories.length,
    data: categories,
  });
});

/**
 * Get single post category by ID
 * @route GET /alumni-portal/admin/categories/:id
 * @access Admin
 */
const getCategory = asyncHandler(async (req, res) => {
  const category = await PostCategory.findByPk(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  res.status(200).json({
    success: true,
    data: category,
  });
});

/**
 * Create new post category
 * @route POST /alumni-portal/admin/categories
 * @access Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, is_default } = req.body;

  // Validate required fields
  if (!name || name.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  // Check if category name already exists
  const existingCategory = await PostCategory.findOne({
    where: { name: name.trim() },
  });

  if (existingCategory) {
    return res.status(400).json({
      success: false,
      message: "Category name already exists",
    });
  }

  // If this is being set as default, unset other default categories
  if (is_default) {
    await PostCategory.update(
      { is_default: false },
      { where: { is_default: true } }
    );
  }

  const category = await PostCategory.create({
    name: name.trim(),
    description: description?.trim() || null,
    is_default: is_default || false,
  });

  res.status(201).json({
    success: true,
    data: category,
  });
});

/**
 * Update existing post category
 * @route PUT /alumni-portal/admin/categories/:id
 * @access Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { name, description, is_default } = req.body;

  const category = await PostCategory.findByPk(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  // Validate required fields
  if (!name || name.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  // Check if category name already exists (excluding current category)
  const existingCategory = await PostCategory.findOne({
    where: {
      name: name.trim(),
      category_id: { [Op.ne]: req.params.id },
    },
  });

  if (existingCategory) {
    return res.status(400).json({
      success: false,
      message: "Category name already exists",
    });
  }

  // If this is being set as default, unset other default categories
  if (is_default && !category.is_default) {
    await PostCategory.update(
      { is_default: false },
      { where: { is_default: true } }
    );
  }

  // Update category
  await category.update({
    name: name.trim(),
    description: description?.trim() || null,
    is_default: is_default || false,
    "updated-at": new Date(),
  });

  res.status(200).json({
    success: true,
    data: category,
  });
});

/**
 * Delete post category and reassign posts to default category
 * @route DELETE /alumni-portal/admin/categories/:id
 * @access Admin
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await PostCategory.findByPk(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  // Check if this is the default category
  if (category.is_default) {
    return res.status(400).json({
      success: false,
      message: "Cannot delete the default category",
    });
  }

  // Count posts using this category
  const postCount = await Post.count({
    where: { category_id: req.params.id },
  });

  if (postCount > 0) {
    // Get the default category
    const defaultCategory = await PostCategory.findOne({
      where: { is_default: true },
    });

    if (!defaultCategory) {
      return res.status(400).json({
        success: false,
        message: "No default category found. Cannot reassign posts.",
      });
    }

    // Reassign posts to default category
    await Post.update(
      { category_id: defaultCategory.category_id },
      { where: { category_id: req.params.id } }
    );
  }

  // Delete the category
  await category.destroy();

  res.status(200).json({
    success: true,
    message: `Category deleted successfully. ${postCount} posts were reassigned to the default category.`,
  });
});

/**
 * Get category statistics including post count
 * @route GET /alumni-portal/admin/categories/:id/stats
 * @access Admin
 */
const getCategoryStats = asyncHandler(async (req, res) => {
  const category = await PostCategory.findByPk(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  const postCount = await Post.count({
    where: { category_id: req.params.id },
  });

  res.status(200).json({
    success: true,
    data: {
      category: category,
      post_count: postCount,
    },
  });
});

module.exports = {
  getAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats,
};
