const HttpStatusHelper = require("../utils/HttpStatuHelper");
const Comment = require("../models/Comment");
const GroupMember = require("../models/GroupMember");
const Like = require("../models/Like");
const User = require("../models/User");
const Graduate = require("../models/Graduate");
const Post = require("../models/Post");
const PostImage = require("../models/PostImage");
const Staff = require("../models/Staff");
const Friendship = require("../models/Friendship");
const checkStaffPermission = require("../utils/permissionChecker");

const { logger, securityLogger } = require("../utils/logger");

const { Op } = require("sequelize");
const moment = require("moment");
const {
  notifyPostLiked,
  notifyPostCommented,
  notifyCommentReplied,
  notifyCommentEdited,
  notifyCommentDeleted,
} = require("../services/notificationService");

const getPostLikeInfo = async (postId, userId = null) => {
  try {
    logger.debug("Calculating post like info", { postId, userId });

    const likesCount = await Like.count({
      where: { "post-id": postId },
    });

    let isLikedByYou = false;
    if (userId) {
      const userLike = await Like.findOne({
        where: {
          "post-id": postId,
          "user-id": userId,
        },
      });
      isLikedByYou = !!userLike;
    }

    logger.debug("Post like info calculated", {
      postId,
      userId,
      likesCount,
      isLikedByYou,
    });

    return { likesCount, isLikedByYou };
  } catch (error) {
    logger.error("Error in getPostLikeInfo", {
      postId,
      userId,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });
    throw error;
  }
};

const createPost = async (req, res) => {
  logger.info("----- [createPost] START -----", {
    timestamp: new Date().toISOString(),
    user: req.user
      ? { id: req.user.id, type: req.user["user-type"] }
      : "undefined",
  });

  try {
    logger.debug("Request details", {
      contentType: req.headers["content-type"],
      authHeader: req.headers["authorization"] ? "Present" : "Missing",
      user: req.user,
      body: req.body,
      filesCount: req.files ? req.files.length : 0,
    });

    const { category, content, groupId, inLanding, type, postAsAdmin } =
      req.body;
    const userId = req.user?.id;

    if (!req.user) {
      logger.warn("CRITICAL: req.user is UNDEFINED in createPost");
      return res.status(403).json({
        status: "fail",
        message: "User not authenticated",
      });
    }

    const allowedUserTypes = ["admin", "staff", "graduate"];
    const userType = req.user["user-type"];

    if (!userId || !allowedUserTypes.includes(userType)) {
      logger.warn("ACCESS DENIED in createPost", {
        userId: !!userId,
        userType: userType,
        allowedTypes: allowedUserTypes,
      });
      return res.status(403).json({
        status: "fail",
        message: "Access denied. Invalid user type or missing user ID.",
      });
    }

    logger.info("User type check passed", { userId, userType });

    if (userType === "staff") {
      const hasPermission = await checkStaffPermission(
        userId,
        "Community Post's management",
        "add"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in createPost", {
          userId,
          requiredPermission: "Community Post's management",
          requiredAction: "add",
        });
        return res.status(403).json({
          status: "fail",
          message: "Access denied. You don't have permission to create posts.",
        });
      }
      logger.info("Staff permission check passed", { userId });
    }

    if (userType === "graduate") {
      const graduate = await Graduate.findOne({
        where: { graduate_id: userId },
      });

      if (!graduate) {
        logger.error("GRADUATE RECORD NOT FOUND in createPost", { userId });
        return res.status(404).json({
          status: "fail",
          message: "Graduate record not found",
        });
      }

      if (graduate.status !== "active") {
        logger.warn("GRADUATE ACCOUNT INACTIVE in createPost", {
          userId,
          currentStatus: graduate.status,
          requiredStatus: "active",
        });
        return res.status(403).json({
          status: "fail",
          message:
            "Your account is inactive, Please contact the Alumni Portal Team to activate your profile.",
        });
      }
      logger.info("Graduate status check passed", {
        userId,
        status: graduate.status,
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      logger.error("USER NOT FOUND IN DATABASE in createPost", { userId });
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    let authorId = userId;
    if (postAsAdmin && user["user-type"] === "staff") {
      const adminUser = await User.findOne({
        where: { "user-type": "admin" },
        attributes: ["id"],
      });

      if (adminUser) {
        authorId = adminUser.id;
        logger.info("Staff posting as Admin", {
          staffId: userId,
          adminId: authorId,
        });
      } else {
        logger.warn("No admin user found, posting as staff", { userId });
      }
    }

    logger.info("Creating post", {
      authorId,
      category: category || type || "General",
      contentLength: content?.length || 0,
      groupId,
      inLanding,
    });

    const newPost = await Post.create({
      category: category || type || "General",
      content: content || "",
      "author-id": authorId,
      "group-id": groupId || null,
      "in-landing": inLanding || false,
    });

    logger.info("Post created successfully", {
      postId: newPost.post_id,
      authorId,
    });

    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      logger.info(`Processing ${req.files.length} file(s) for post`, {
        postId: newPost.post_id,
      });

      try {
        const imagesData = req.files.map((file) => ({
          "post-id": newPost.post_id,
          "image-url": file.path || file.url || file.location || null,
        }));

        await PostImage.bulkCreate(imagesData);
        logger.info("Images saved to PostImage table", {
          postId: newPost.post_id,
          imagesCount: imagesData.length,
        });
      } catch (imgErr) {
        logger.error("Error saving images to DB", {
          postId: newPost.post_id,
          error: imgErr.message,
        });
      }
    }

    logger.info("----- [createPost] END SUCCESS -----", {
      postId: newPost.post_id,
    });

    return res.status(201).json({
      status: "success",
      message: "Post created successfully",
      post: newPost,
    });
  } catch (error) {
    logger.error("----- [createPost] Unexpected Error", {
      error: error.message,
      stack: error.stack,
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to create post",
    });
  }
};

const getGroupPosts = async (req, res) => {
  logger.info("----- [getGroupPosts] START -----", {
    groupId: req.params.groupId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const { groupId } = req.params;
    const userId = req.user?.id;

    logger.info("Getting group posts", { groupId, userId });

    const allowedUserTypes = ["admin", "staff", "graduate"];

    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("ACCESS DENIED in getGroupPosts", {
        userType: req.user ? req.user["user-type"] : "undefined",
        groupId,
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
        data: [],
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Community Post's management",
        "view"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in getGroupPosts", {
          userId: req.user.id,
          groupId,
          requiredPermission: "Community Post's management",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view group posts.",
          data: [],
        });
      }
    }

    const posts = await Post.findAll({
      where: {
        "group-id": groupId,
        "is-hidden": false,
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
            {
              model: Staff,
              attributes: ["status-to-login"],
            },
          ],
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name"],
            },
          ],
        },
        {
          model: Comment,
          attributes: [
            "comment_id",
            "content",
            "created-at",
            "edited",
            "author-id",
          ],
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "user-type",
              ],
              include: [
                {
                  model: Graduate,
                  as: "Graduate",
                  attributes: ["profile-picture-url"],
                },
              ],
            },
          ],
          order: [["created-at", "DESC"]],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    logger.info("Group posts fetched successfully", {
      groupId,
      postsCount: posts.length,
      userId,
    });

    const currentUserId = req.user?.id || null;

    const responseData = posts.map((post) => {
      let image = null;

      if (post.User.Graduate) {
        image = post.User.Graduate["profile-picture-url"];
      } else if (post.User.Staff) {
        image = null;
      }

      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou = currentUserId
        ? post.Likes?.some((like) => like["user-id"] === currentUserId) || false
        : false;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User.id,
          "full-name": `${post.User["first-name"]} ${post.User["last-name"]}`,
          email: post.User.email,
          type: post.User["user-type"],
          image: image,
        },
        "group-id": post["group-id"],
        "in-landing": post["in-landing"],
        "is-hidden": post["is-hidden"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: {
                id: like.User?.id || "unknown",
                "full-name":
                  `${like.User?.["first-name"] || ""} ${
                    like.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              time_since: moment(comment["created-at"]).fromNow(),
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                email: comment.User?.email || "unknown",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
      };
    });

    logger.info("----- [getGroupPosts] END SUCCESS -----", {
      groupId,
      postsCount: responseData.length,
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Visible group posts fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getGroupPosts] Error", {
      groupId: req.params.groupId,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to fetch group posts: " + error.message,
      data: [],
    });
  }
};

const getAllPostsOfUsers = async (req, res) => {
  logger.info("----- [getAllPostsOfUsers] START -----", {
    userId: req.user?.id,
    userType: req.user?.["user-type"],
    page: req.query.page,
    limit: req.query.limit,
  });

  try {
    const user = req.user;
    const isAdmin = user && user["user-type"] === "admin";
    const isStaff = user && user["user-type"] === "staff";
    const isGraduate = user && user["user-type"] === "graduate";

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    logger.info("Getting all posts of users", {
      userId: user?.id,
      userType: user?.["user-type"],
      page,
      limit,
    });

    let whereCondition = {};

    if (isAdmin) {
      whereCondition = {};
    } else if (isStaff) {
      whereCondition = { "is-hidden": false };
    } else if (isGraduate) {
      const friendships = await Friendship.findAll({
        where: {
          [Op.or]: [
            { sender_id: user.id, status: "accepted" },
            { receiver_id: user.id, status: "accepted" },
          ],
        },
      });

      const friendIds = friendships.map((friendship) =>
        friendship.sender_id === user.id
          ? friendship.receiver_id
          : friendship.sender_id
      );

      friendIds.push(user.id);

      const adminAndStaffUsers = await User.findAll({
        where: {
          [Op.or]: [{ "user-type": "admin" }, { "user-type": "staff" }],
        },
        attributes: ["id"],
      });

      const adminAndStaffIds = adminAndStaffUsers.map((user) => user.id);
      const allAuthorIds = [...friendIds, ...adminAndStaffIds];

      whereCondition = {
        "is-hidden": false,
        "author-id": { [Op.in]: allAuthorIds },
      };
    } else {
      whereCondition = { "is-hidden": false };
    }

    const posts = await Post.findAll({
      where: whereCondition,
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            { model: Graduate, attributes: ["profile-picture-url"] },
            { model: Staff, attributes: ["status-to-login"] },
          ],
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name"],
            },
          ],
        },
        {
          model: Comment,
          attributes: [
            "comment_id",
            "content",
            "created-at",
            "edited",
            "author-id",
          ],
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "user-type",
              ],
              include: [
                {
                  model: Graduate,
                  as: "Graduate",
                  attributes: ["profile-picture-url"],
                },
              ],
            },
          ],
          order: [["created-at", "DESC"]],
        },
      ],
      order: [["created-at", "DESC"]],
      limit: limit,
      offset: offset,
    });

    const totalPosts = await Post.count({ where: whereCondition });
    const totalPages = Math.ceil(totalPosts / limit);
    const hasMore = page < totalPages;

    const currentUserId = req.user?.id || null;

    const responseData = posts.map((post) => {
      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou = currentUserId
        ? post.Likes?.some((like) => like["user-id"] === currentUserId) || false
        : false;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User.id,
          "full-name": `${post.User["first-name"]} ${post.User["last-name"]}`,
          email: post.User.email,
          type: post.User["user-type"],
          image: post.User.Graduate
            ? post.User.Graduate["profile-picture-url"]
            : null,
        },
        "group-id": post["group-id"],
        "in-landing": post["in-landing"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        "is-hidden": post["is-hidden"],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: {
                id: like.User?.id || "unknown",
                "full-name":
                  `${like.User?.["first-name"] || ""} ${
                    like.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              time_since: moment(comment["created-at"]).fromNow(),
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                email: comment.User?.email || "unknown",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
      };
    });

    logger.info("All posts fetched successfully", {
      totalPosts,
      returnedPosts: posts.length,
      page,
      totalPages,
    });

    logger.info("----- [getAllPostsOfUsers] END SUCCESS -----", {
      totalPosts,
      returnedPosts: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "All posts fetched successfully",
      data: responseData,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalPosts: totalPosts,
        hasMore: hasMore,
        limit: limit,
      },
    });
  } catch (error) {
    logger.error("----- [getAllPostsOfUsers] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch posts: " + error.message,
      data: [],
    });
  }
};

const getAllPosts = async (req, res) => {
  logger.info("----- [getAllPosts] START -----", {
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const user = req.user;
    const isAdmin = user && user["user-type"] === "admin";
    const isStaff = user && user["user-type"] === "staff";

    logger.info("Getting all posts", {
      userId: user?.id,
      userType: user?.["user-type"],
      isAdmin,
      isStaff,
    });

    if (isStaff) {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Graduates posts management",
        "view"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in getAllPosts", {
          userId: user.id,
          requiredPermission: "Graduates posts management",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view graduates posts.",
          data: [],
        });
      }
    }

    const whereCondition = isAdmin || isStaff ? {} : { "is-hidden": false };

    const posts = await Post.findAll({
      where: whereCondition,
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          where: { "user-type": "graduate" },
          include: [{ model: Graduate, attributes: ["profile-picture-url"] }],
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name"],
            },
          ],
        },
        {
          model: Comment,
          attributes: [
            "comment_id",
            "content",
            "created-at",
            "edited",
            "author-id",
          ],
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "user-type",
              ],
              include: [
                {
                  model: Graduate,
                  as: "Graduate",
                  attributes: ["profile-picture-url"],
                },
              ],
            },
          ],
          order: [["created-at", "DESC"]],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    logger.info("Posts fetched successfully", {
      postsCount: posts.length,
      whereCondition,
    });

    const currentUserId = req.user?.id || null;

    const responseData = posts.map((post) => {
      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou = currentUserId
        ? post.Likes?.some((like) => like["user-id"] === currentUserId) || false
        : false;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User.id,
          "full-name": `${post.User["first-name"]} ${post.User["last-name"]}`,
          email: post.User.email,
          image: post.User.Graduate
            ? post.User.Graduate["profile-picture-url"]
            : null,
        },
        "group-id": post["group-id"],
        "in-landing": post["in-landing"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        "is-hidden": post["is-hidden"],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: {
                id: like.User?.id || "unknown",
                "full-name":
                  `${like.User?.["first-name"] || ""} ${
                    like.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              time_since: moment(comment["created-at"]).fromNow(),
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                email: comment.User?.email || "unknown",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
      };
    });

    logger.info("----- [getAllPosts] END SUCCESS -----", {
      postsCount: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "Posts fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getAllPosts] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch posts: " + error.message,
      data: [],
    });
  }
};

const hideNegativePost = async (req, res) => {
  logger.info("----- [hideNegativePost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const user = req.user;
    const { postId } = req.params;

    logger.info("Attempting to hide post", {
      postId,
      userId: user?.id,
      userType: user?.["user-type"],
    });

    if (
      !user ||
      (user["user-type"] !== "admin" && user["user-type"] !== "staff")
    ) {
      logger.warn("UNAUTHORIZED hide post attempt", {
        postId,
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        status: "fail",
        message: "Only admins and staff can hide posts",
        data: [],
      });
    }

    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Graduates posts management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED for hide post", {
          userId: user.id,
          postId,
          requiredPermission: "Graduates posts management",
        });
        return res.status(403).json({
          status: "fail",
          message:
            "Access denied. You don't have permission to hide graduates posts.",
          data: [],
        });
      }
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for hiding", { postId });
      return res.status(404).json({
        status: "fail",
        message: "Post not found",
        data: [],
      });
    }

    await Post.update({ "is-hidden": true }, { where: { post_id: postId } });

    logger.info("Post hidden successfully", {
      postId,
      userId: user.id,
      userType: user["user-type"],
      postContent: post.content.substring(0, 100),
    });

    logger.info("----- [hideNegativePost] END SUCCESS -----", { postId });

    return res.status(200).json({
      status: "success",
      message: "Post hidden successfully",
      data: [
        {
          postId: post.post_id,
          content: post.content,
          isHidden: true,
        },
      ],
    });
  } catch (err) {
    logger.error("----- [hideNegativePost] Error", {
      postId: req.params.postId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

const unhidePost = async (req, res) => {
  logger.info("----- [unhidePost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const user = req.user;
    const { postId } = req.params;

    logger.info("Attempting to unhide post", {
      postId,
      userId: user?.id,
      userType: user?.["user-type"],
    });

    if (
      !user ||
      (user["user-type"] !== "admin" && user["user-type"] !== "staff")
    ) {
      logger.warn("UNAUTHORIZED unhide post attempt", {
        postId,
        userId: user?.id,
        userType: user?.["user-type"],
      });
      return res.status(403).json({
        status: "fail",
        message: "Only admins and staff can unhide posts",
        data: [],
      });
    }

    if (user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        user.id,
        "Graduates posts management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED for unhide post", {
          userId: user.id,
          postId,
          requiredPermission: "Graduates posts management",
        });
        return res.status(403).json({
          status: "fail",
          message:
            "Access denied. You don't have permission to unhide graduates posts.",
          data: [],
        });
      }
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for unhiding", { postId });
      return res.status(404).json({
        status: "fail",
        message: "Post not found",
        data: [],
      });
    }

    await Post.update({ "is-hidden": false }, { where: { post_id: postId } });

    logger.info("Post unhidden successfully", {
      postId,
      userId: user.id,
      userType: user["user-type"],
      postContent: post.content.substring(0, 100),
    });

    logger.info("----- [unhidePost] END SUCCESS -----", { postId });

    return res.status(200).json({
      status: "success",
      message: "Post unhidden successfully",
      data: [
        {
          postId: post.post_id,
          content: post.content,
          isHidden: false,
        },
      ],
    });
  } catch (err) {
    logger.error("----- [unhidePost] Error", {
      postId: req.params.postId,
      error: err.message,
      stack: err.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    return res.status(500).json({
      status: "error",
      message: err.message,
      data: [],
    });
  }
};

const getAdminPosts = async (req, res) => {
  logger.info("----- [getAdminPosts] START -----", {
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    logger.info("Getting admin posts", {
      userId: req.user?.id,
      userType: req.user?.["user-type"],
    });

    const allowedUserTypes = ["admin", "staff", "graduate"];

    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("ACCESS DENIED in getAdminPosts", {
        userType: req.user ? req.user["user-type"] : "undefined",
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
        data: [],
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Portal posts management",
        "view"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED in getAdminPosts", {
          userId: req.user.id,
          requiredPermission: "Portal posts management",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to view portal posts.",
          data: [],
        });
      }
    }

    const posts = await Post.findAll({
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          where: {
            "user-type": {
              [Op.in]: ["admin", "staff"],
            },
          },
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name", "user-type"],
            },
          ],
        },
        {
          model: Comment,
          attributes: [
            "comment_id",
            "content",
            "created-at",
            "edited",
            "author-id",
          ],
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "user-type",
              ],
              include: [
                {
                  model: Graduate,
                  as: "Graduate",
                  attributes: ["profile-picture-url"],
                },
              ],
            },
          ],
          order: [["created-at", "DESC"]],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    logger.info("Admin posts fetched successfully", {
      postsCount: posts.length,
    });

    const currentUserId = req.user?.id || null;

    const responseData = posts.map((post) => {
      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou = currentUserId
        ? post.Likes?.some((like) => like["user-id"] === currentUserId) || false
        : false;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User?.id || "unknown",
          "full-name":
            `${post.User?.["first-name"] || ""} ${
              post.User?.["last-name"] || ""
            }`.trim() || "Unknown User",
          email: post.User?.email || "unknown",
          type: post.User?.["user-type"] || "unknown",
        },
        "group-id": post["group-id"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: {
                id: like.User?.id || "unknown",
                "full-name":
                  `${like.User?.["first-name"] || ""} ${
                    like.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                "user-type": like.User?.["user-type"] || "unknown",
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              time_since: moment(comment["created-at"]).fromNow(),
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                email: comment.User?.email || "unknown",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
        "in-landing": post["in-landing"] || false,
      };
    });

    logger.info("----- [getAdminPosts] END SUCCESS -----", {
      postsCount: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "Admin and staff posts fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getAdminPosts] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      user: req.user
        ? { id: req.user.id, type: req.user["user-type"] }
        : "undefined",
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch admin and staff posts",
      data: [],
    });
  }
};

const getGraduatePosts = async (req, res) => {
  logger.info("----- [getGraduatePosts] START -----", {
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    logger.info("Getting graduate posts", { userId: req.user?.id });

    if (!req.user || req.user["user-type"] !== "graduate") {
      logger.warn("UNAUTHORIZED access to graduate posts", {
        userType: req.user ? req.user["user-type"] : "undefined",
      });
      return res.status(403).json({
        status: "error",
        message: "Not authorized as a graduate",
        data: [],
      });
    }

    const posts = await Post.findAll({
      where: { "author-id": req.user.id },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
          ],
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "user-id"],
          include: [
            {
              model: User,
              attributes: ["id", "first-name", "last-name", "user-type"],
            },
          ],
        },
        {
          model: Comment,
          attributes: [
            "comment_id",
            "content",
            "created-at",
            "edited",
            "author-id",
          ],
          include: [
            {
              model: User,
              attributes: [
                "id",
                "first-name",
                "last-name",
                "email",
                "user-type",
              ],
              include: [
                {
                  model: Graduate,
                  as: "Graduate",
                  attributes: ["profile-picture-url"],
                },
              ],
            },
          ],
          order: [["created-at", "DESC"]],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    logger.info("Graduate posts fetched successfully", {
      userId: req.user.id,
      postsCount: posts.length,
    });

    const currentUserId = req.user?.id || null;

    const responseData = posts.map((post) => {
      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou = currentUserId
        ? post.Likes?.some((like) => like["user-id"] === currentUserId) || false
        : false;

      return {
        id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User.id,
          "full-name": `${post.User["first-name"]} ${post.User["last-name"]}`,
          email: post.User.email,
          "user-type": post.User["user-type"],
          image: post.User.Graduate
            ? post.User.Graduate["profile-picture-url"]
            : null,
        },
        "group-id": post["group-id"],
        "in-landing": post["in-landing"],
        "is-hidden": post["is-hidden"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
        likes: post.Likes
          ? post.Likes.map((like) => ({
              like_id: like.like_id,
              user: {
                id: like.User?.id || "unknown",
                "full-name":
                  `${like.User?.["first-name"] || ""} ${
                    like.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                "user-type": like.User?.["user-type"] || "unknown",
              },
            }))
          : [],
        comments_count: post.Comments ? post.Comments.length : 0,
        comments: post.Comments
          ? post.Comments.map((comment) => ({
              comment_id: comment.comment_id,
              content: comment.content,
              "created-at": comment["created-at"],
              time_since: moment(comment["created-at"]).fromNow(),
              edited: comment.edited,
              author: {
                id: comment.User?.id || "unknown",
                "full-name":
                  `${comment.User?.["first-name"] || ""} ${
                    comment.User?.["last-name"] || ""
                  }`.trim() || "Unknown User",
                email: comment.User?.email || "unknown",
                "user-type": comment.User?.["user-type"] || "unknown",
                image: comment.User?.Graduate
                  ? comment.User.Graduate["profile-picture-url"]
                  : null,
              },
            }))
          : [],
      };
    });

    logger.info("----- [getGraduatePosts] END SUCCESS -----", {
      postsCount: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "Graduate posts fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getGraduatePosts] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      userId: req.user?.id,
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch graduate posts: " + error.message,
      data: [],
    });
  }
};

const getMyPosts = async (req, res) => {
  logger.info("----- [getMyPosts] START -----", {
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const userId = req.user.id;

    logger.info("Getting user's own posts", { userId });

    const posts = await Post.findAll({
      where: { "author-id": userId },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
            {
              model: Staff,
              attributes: ["status-to-login"],
            },
          ],
        },
        {
          model: PostImage,
          attributes: ["image-url"],
        },
        {
          model: Like,
          attributes: ["like_id", "author-id", "user-id"],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    const responseData = posts.map((post) => {
      const likesCount = post.Likes ? post.Likes.length : 0;
      const isLikedByYou =
        post.Likes?.some((like) => like["user-id"] === userId) || false;

      return {
        post_id: post.post_id,
        category: post.category,
        content: post.content,
        description: post.description,
        "created-at": post["created-at"],
        author: {
          id: post.User.id,
          "full-name": `${post.User["first-name"]} ${post.User["last-name"]}`,
          email: post.User.email,
          type: post.User["user-type"],
          image: post.User.Graduate
            ? post.User.Graduate["profile-picture-url"]
            : null,
        },
        "group-id": post["group-id"],
        "in-landing": post["in-landing"],
        "is-hidden": post["is-hidden"],
        images: post.PostImages
          ? post.PostImages.map((img) => img["image-url"])
          : [],
        likesCount: likesCount,
        isLikedByYou: isLikedByYou,
      };
    });

    logger.info("User posts fetched successfully", {
      userId,
      postsCount: posts.length,
    });

    logger.info("----- [getMyPosts] END SUCCESS -----", {
      postsCount: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "User posts fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getMyPosts] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      userId: req.user?.id,
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch user posts: " + error.message,
      data: [],
    });
  }
};

const editPost = async (req, res) => {
  logger.info("----- [editPost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const { postId } = req.params;
    const { category, type, content, link, groupId, inLanding, removeImages } =
      req.body;

    logger.info("Editing post", {
      postId,
      userId: req.user?.id,
      hasContent: !!content,
      contentLength: content?.length || 0,
      hasCategory: !!category,
      hasType: !!type,
      removeImagesCount: removeImages?.length || 0,
    });

    const post = await Post.findByPk(postId, {
      include: [{ model: PostImage, attributes: ["image-url"] }],
    });

    if (!post) {
      logger.warn("Post not found for editing", { postId });
      return res
        .status(404)
        .json({ status: "error", message: "Post not found" });
    }

    const oldContent = post.content;
    const oldCategory = post.category;
    const oldImages = post.PostImages.map((img) => img["image-url"]);

    if (category !== undefined) post.category = category;
    if (type !== undefined) post.category = type;
    if (content !== undefined) post.content = content;
    if (link !== undefined) post.link = link;
    if (groupId !== undefined)
      post["group-id"] = groupId === null ? null : groupId;
    if (inLanding !== undefined) post["in-landing"] = inLanding;

    await post.save();

    if (
      removeImages &&
      Array.isArray(removeImages) &&
      removeImages.length > 0
    ) {
      logger.info("Removing images from post", {
        postId,
        imagesToRemove: removeImages,
      });
      await PostImage.destroy({
        where: { "post-id": postId, "image-url": removeImages },
      });
    }

    if (req.files && req.files.length > 0) {
      logger.info("Adding new images to post", {
        postId,
        newImagesCount: req.files.length,
      });
      const uploadedImages = req.files.map((file) => ({
        "post-id": postId,
        "image-url": file.path || file.url || file.location,
      }));
      await PostImage.bulkCreate(uploadedImages);
    }

    const updatedPost = await Post.findByPk(postId, {
      include: [{ model: PostImage, attributes: ["image-url"] }],
    });

    const newContent = updatedPost.content;
    const newCategory = updatedPost.category;
    const newImages = updatedPost.PostImages.map((img) => img["image-url"]);
    const imagesChanged =
      JSON.stringify(oldImages) !== JSON.stringify(newImages);

    logger.info("Post updated details", {
      postId,
      oldContent: oldContent.substring(0, 100),
      newContent: newContent.substring(0, 100),
      oldCategory,
      newCategory,
      oldImagesCount: oldImages.length,
      newImagesCount: newImages.length,
      imagesChanged,
    });

    logger.info("----- [editPost] END SUCCESS -----", { postId });

    return res.status(200).json({
      status: "success",
      message: "Post updated successfully",
      data: {
        postId,
        oldContent,
        newContent,
        oldCategory,
        newCategory,
        oldImages,
        newImages,
        imagesChanged,
      },
    });
  } catch (error) {
    logger.error("----- [editPost] Error", {
      postId: req.params.postId,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });
    return res.status(500).json({ status: "error", message: error.message });
  }
};

const likePost = async (req, res) => {
  logger.info("----- [likePost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
  });

  try {
    const { postId } = req.params;
    const userId = req.user.id;

    logger.info("Like post attempt", { postId, userId });

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for like", { postId, userId });
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const existingLike = await Like.findOne({
      where: {
        "post-id": postId,
        "user-id": userId,
      },
    });

    if (existingLike) {
      await existingLike.destroy();
      logger.info("Like removed successfully", { postId, userId });

      logger.info("----- [likePost] END SUCCESS (Unlike) -----", {
        postId,
        userId,
      });

      return res.json({
        status: HttpStatusHelper.SUCCESS,
        message: "Like removed successfully",
      });
    }

    const newLike = await Like.create({
      "post-id": postId,
      "user-id": userId,
    });

    if (post["author-id"] !== userId) {
      await notifyPostLiked(post["author-id"], userId, postId);
    }

    logger.info("Post liked successfully", {
      postId,
      userId,
      likeId: newLike.like_id,
    });

    logger.info("----- [likePost] END SUCCESS (Like) -----", {
      postId,
      userId,
      likeId: newLike.like_id,
    });

    return res.status(201).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Post liked successfully",
      like: newLike,
    });
  } catch (error) {
    logger.error("----- [likePost] Error", {
      postId: req.params.postId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const unlikePost = async (req, res) => {
  logger.info("----- [unlikePost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
  });

  try {
    const { postId } = req.params;
    const userId = req.user.id;

    logger.info("Unlike post attempt", { postId, userId });

    const like = await Like.findOne({
      where: {
        "post-id": postId,
        "user-id": userId,
      },
    });

    if (!like) {
      logger.warn("Like not found for unlike", { postId, userId });
      return res.status(404).json({
        status: "error",
        message: "Like not found",
      });
    }

    await like.destroy();

    logger.info("Post unliked successfully", { postId, userId });

    logger.info("----- [unlikePost] END SUCCESS -----", { postId, userId });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Post unliked successfully",
    });
  } catch (error) {
    logger.error("----- [unlikePost] Error", {
      postId: req.params.postId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const addComment = async (req, res) => {
  logger.info("----- [addComment] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
  });

  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    logger.info("Add comment attempt", {
      postId,
      userId,
      contentLength: content?.length,
    });

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for comment", { postId, userId });
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    if (!content || content.trim().length === 0) {
      logger.warn("Empty comment content", { postId, userId });
      return res.status(400).json({
        status: "error",
        message: "Comment content is required",
      });
    }

    const newComment = await Comment.create({
      content: content.trim(),
      "post-id": postId,
      "author-id": userId,
    });

    const commentWithAuthor = await Comment.findByPk(newComment.comment_id, {
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
          ],
        },
      ],
    });

    if (post["author-id"] !== userId) {
      await notifyPostCommented(
        post["author-id"],
        userId,
        postId,
        newComment.comment_id
      );
    }

    logger.info("Comment added successfully", {
      postId,
      userId,
      commentId: newComment.comment_id,
    });

    logger.info("----- [addComment] END SUCCESS -----", {
      postId,
      userId,
      commentId: newComment.comment_id,
    });

    return res.status(201).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Comment added successfully",
      comment: {
        comment_id: commentWithAuthor.comment_id,
        content: commentWithAuthor.content,
        "created-at": commentWithAuthor["created-at"],
        edited: commentWithAuthor.edited,
        author: {
          id: commentWithAuthor.User.id,
          "full-name": `${commentWithAuthor.User["first-name"]} ${commentWithAuthor.User["last-name"]}`,
          email: commentWithAuthor.User.email,
          image: commentWithAuthor.User.Graduate
            ? commentWithAuthor.User.Graduate["profile-picture-url"]
            : null,
        },
      },
    });
  } catch (error) {
    logger.error("----- [addComment] Error", {
      postId: req.params.postId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const editComment = async (req, res) => {
  logger.info("----- [editComment] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    logger.info("Edit comment attempt", { commentId, userId });

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      logger.warn("Comment not found for editing", { commentId, userId });
      return res.status(404).json({
        status: "error",
        message: "Comment not found",
      });
    }

    if (comment["author-id"] !== userId) {
      logger.warn("UNAUTHORIZED comment edit attempt", {
        commentId,
        userId,
        authorId: comment["author-id"],
      });
      return res.status(403).json({
        status: "error",
        message: "You can only edit your own comments",
      });
    }

    if (!content || content.trim().length === 0) {
      logger.warn("Empty comment content for edit", { commentId, userId });
      return res.status(400).json({
        status: "error",
        message: "Comment content is required",
      });
    }

    comment.content = content.trim();
    comment.edited = true;
    await comment.save();

    const post = await Post.findByPk(comment["post-id"]);
    if (post && post["author-id"] !== userId) {
      await notifyCommentEdited(
        post["author-id"],
        userId,
        post.post_id,
        commentId
      );
    }

    const updatedComment = await Comment.findByPk(commentId, {
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
    });

    logger.info("Comment updated successfully", { commentId, userId });

    logger.info("----- [editComment] END SUCCESS -----", {
      commentId,
      userId,
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Comment updated successfully",
      comment: {
        comment_id: updatedComment.comment_id,
        content: updatedComment.content,
        "created-at": updatedComment["created-at"],
        edited: updatedComment.edited,
        author: {
          id: updatedComment.User.id,
          "full-name": `${updatedComment.User["first-name"]} ${updatedComment.User["last-name"]}`,
          email: updatedComment.User.email,
        },
      },
    });
  } catch (error) {
    logger.error("----- [editComment] Error", {
      commentId: req.params.commentId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const deleteComment = async (req, res) => {
  logger.info("----- [deleteComment] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    logger.info("Delete comment attempt", { commentId, userId });

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      logger.warn("Comment not found for deletion", { commentId, userId });
      return res.status(404).json({
        status: "error",
        message: "Comment not found",
      });
    }

    if (comment["author-id"] !== userId) {
      logger.warn("UNAUTHORIZED comment deletion attempt", {
        commentId,
        userId,
        authorId: comment["author-id"],
      });
      return res.status(403).json({
        status: "error",
        message: "You can only delete your own comments",
      });
    }

    const post = await Post.findByPk(comment["post-id"]);
    const postId = post ? post.post_id : null;

    await comment.destroy();

    if (post && post["author-id"] !== userId && postId) {
      await notifyCommentDeleted(post["author-id"], userId, postId);
    }

    logger.info("Comment deleted successfully", { commentId, userId, postId });

    logger.info("----- [deleteComment] END SUCCESS -----", {
      commentId,
      userId,
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    logger.error("----- [deleteComment] Error", {
      commentId: req.params.commentId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const deletePost = async (req, res) => {
  logger.info("----- [deletePost] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
  });

  try {
    const { postId } = req.params;
    const userId = req.user.id;

    logger.info("Delete post attempt", {
      postId,
      userId,
      userType: req.user["user-type"],
    });

    const allowedUserTypes = ["admin", "staff", "graduate"];

    if (!userId || !allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("UNAUTHORIZED delete post attempt", {
        postId,
        userId,
        userType: req.user["user-type"],
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasCommunityPermission = await checkStaffPermission(
        userId,
        "Community Post's management",
        "delete"
      );

      const hasPortalPermission = await checkStaffPermission(
        userId,
        "Portal posts management",
        "delete"
      );

      if (!hasCommunityPermission && !hasPortalPermission) {
        logger.warn("STAFF PERMISSION DENIED for delete post", {
          userId,
          postId,
          hasCommunityPermission,
          hasPortalPermission,
        });
        return res.status(403).json({
          status: "error",
          message: "Access denied. You don't have permission to delete posts.",
        });
      }
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for deletion", { postId, userId });
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    if (post["is-hidden"]) {
      logger.warn("Attempt to delete hidden post", { postId, userId });
      return res.status(403).json({
        status: "error",
        message: "Cannot delete a hidden post",
      });
    }

    const postAuthor = await User.findByPk(post["author-id"]);
    if (!postAuthor) {
      logger.error("Post author not found", {
        postId,
        authorId: post["author-id"],
      });
      return res.status(404).json({
        status: "error",
        message: "Post author not found",
      });
    }

    const isOwnPost = post["author-id"] === userId;
    const isGraduatePost = postAuthor["user-type"] === "graduate";
    const isStaffDeletingAdminPost =
      req.user["user-type"] === "staff" && postAuthor["user-type"] === "admin";
    const isAdminDeletingStaffPost =
      req.user["user-type"] === "admin" && postAuthor["user-type"] === "staff";

    if (
      !isOwnPost &&
      !isGraduatePost &&
      !isStaffDeletingAdminPost &&
      !isAdminDeletingStaffPost
    ) {
      logger.warn("UNAUTHORIZED post deletion - permission issue", {
        postId,
        userId,
        userType: req.user["user-type"],
        authorId: post["author-id"],
        authorType: postAuthor["user-type"],
        isOwnPost,
        isGraduatePost,
        isStaffDeletingAdminPost,
        isAdminDeletingStaffPost,
      });
      return res.status(403).json({
        status: "error",
        message:
          "You can only delete your own posts, posts created by graduates, or admin posts (for staff), or staff posts (for admin)",
      });
    }

    await Comment.destroy({ where: { "post-id": postId } });
    await Like.destroy({ where: { "post-id": postId } });

    await post.destroy();

    logger.info("Post deleted successfully", {
      postId,
      userId,
      userType: req.user["user-type"],
      authorId: post["author-id"],
      authorType: postAuthor["user-type"],
    });

    logger.info("----- [deletePost] END SUCCESS -----", { postId, userId });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Post deleted successfully",
    });
  } catch (error) {
    logger.error("----- [deletePost] Error", {
      postId: req.params.postId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const getPostWithDetails = async (req, res) => {
  logger.info("----- [getPostWithDetails] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
  });

  try {
    const { postId } = req.params;

    logger.info("Getting post with details", { postId, userId: req.user?.id });

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for details", { postId });
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const author = await User.findByPk(post["author-id"], {
      include: [
        {
          model: Graduate,
          attributes: ["profile-picture-url"],
        },
      ],
    });

    const comments = await Comment.findAll({
      where: {
        "post-id": postId,
        "parent-comment-id": null,
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
          ],
        },
      ],
      order: [["created-at", "ASC"]],
    });

    const commentIds = comments.map((comment) => comment.comment_id);
    const replies = await Comment.findAll({
      where: {
        "post-id": postId,
        "parent-comment-id": { [Op.in]: commentIds },
      },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email", "user-type"],
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
          ],
        },
      ],
      order: [["created-at", "ASC"]],
    });

    const repliesByParent = {};
    replies.forEach((reply) => {
      const parentId = reply["parent-comment-id"];
      if (!repliesByParent[parentId]) {
        repliesByParent[parentId] = [];
      }
      repliesByParent[parentId].push(reply);
    });

    const likes = await Like.findAll({
      where: { "post-id": postId },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
    });

    const currentUserId = req.user?.id || null;
    const likesCount = likes.length;
    const isLikedByYou = currentUserId
      ? likes.some((like) => like["user-id"] === currentUserId) || false
      : false;

    const responseData = {
      post_id: post.post_id,
      category: post.category,
      content: post.content,
      "created-at": post["created-at"],
      author: {
        id: author.id,
        "full-name": `${author["first-name"]} ${author["last-name"]}`,
        email: author.email,
        image: author.Graduate ? author.Graduate["profile-picture-url"] : null,
      },
      "group-id": post["group-id"],
      "in-landing": post["in-landing"],
      comments: comments.map((comment) => ({
        comment_id: comment.comment_id,
        content: comment.content,
        "created-at": comment["created-at"],
        time_since: moment(comment["created-at"]).fromNow(),
        edited: comment.edited,
        "parent-comment-id": comment["parent-comment-id"],
        author: {
          id: comment.User.id,
          "full-name": `${comment.User["first-name"]} ${comment.User["last-name"]}`,
          email: comment.User.email,
          "user-type": comment.User["user-type"] || "unknown",
          image:
            comment.User["user-type"] === "graduate" && comment.User.Graduate
              ? comment.User.Graduate["profile-picture-url"]
              : null,
        },
        replies: repliesByParent[comment.comment_id]
          ? repliesByParent[comment.comment_id].map((reply) => ({
              comment_id: reply.comment_id,
              content: reply.content,
              "created-at": reply["created-at"],
              edited: reply.edited,
              "parent-comment-id": reply["parent-comment-id"],
              author: {
                id: reply.User.id,
                "full-name": `${reply.User["first-name"]} ${reply.User["last-name"]}`,
                email: reply.User.email,
                "user-type": reply.User["user-type"] || "unknown",
              },
            }))
          : [],
      })),
      likes: likes.map((like) => ({
        like_id: like.like_id,
        user: {
          id: like.User.id,
          "full-name": `${like.User["first-name"]} ${like.User["last-name"]}`,
          email: like.User.email,
        },
      })),
      likesCount: likesCount,
      isLikedByYou: isLikedByYou,
    };

    logger.info("Post details fetched successfully", { postId });

    logger.info("----- [getPostWithDetails] END SUCCESS -----", { postId });

    res.status(200).json({
      status: "success",
      message: "Post details fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getPostWithDetails] Error", {
      postId: req.params.postId,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch post details: " + error.message,
      data: null,
    });
  }
};

const getCategories = async (req, res) => {
  logger.info("----- [getCategories] START -----", {
    userId: req.user?.id,
  });

  try {
    logger.info("Getting post categories", { userId: req.user?.id });

    const query = `
      SELECT unnest(enum_range(NULL::"enum_Post_category")) AS category;
    `;
    const [results] = await Post.sequelize.query(query);

    logger.info("Categories fetched successfully", {
      categoriesCount: results.length,
    });

    logger.info("----- [getCategories] END SUCCESS -----", {
      categoriesCount: results.length,
    });

    res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "All categories fetched successfully",
      data: results.map((r) => r.category),
    });
  } catch (error) {
    logger.error("----- [getCategories] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: "Failed to fetch categories: " + error.message,
      data: [],
    });
  }
};

const addReply = async (req, res) => {
  logger.info("----- [addReply] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    logger.info("Add reply attempt", {
      commentId,
      userId,
      contentLength: content?.length,
    });

    const parentComment = await Comment.findByPk(commentId);
    if (!parentComment) {
      logger.warn("Parent comment not found for reply", { commentId, userId });
      return res.status(404).json({
        status: "error",
        message: "Parent comment not found",
      });
    }

    if (!content || content.trim().length === 0) {
      logger.warn("Empty reply content", { commentId, userId });
      return res.status(400).json({
        status: "error",
        message: "Reply content is required",
      });
    }

    const newReply = await Comment.create({
      content: content.trim(),
      "post-id": parentComment["post-id"],
      "author-id": userId,
      "parent-comment-id": commentId,
    });

    await Post.increment("comments-count", {
      where: { post_id: parentComment["post-id"] },
    });

    if (parentComment["author-id"] !== userId) {
      await notifyCommentReplied(
        parentComment["author-id"],
        userId,
        parentComment["post-id"],
        commentId,
        newReply.comment_id
      );
    }

    const replyWithAuthor = await Comment.findByPk(newReply.comment_id, {
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
    });

    logger.info("Reply added successfully", {
      commentId,
      userId,
      replyId: newReply.comment_id,
      postId: parentComment["post-id"],
    });

    logger.info("----- [addReply] END SUCCESS -----", {
      commentId,
      userId,
      replyId: newReply.comment_id,
    });

    return res.status(201).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Reply added successfully",
      reply: {
        comment_id: replyWithAuthor.comment_id,
        content: replyWithAuthor.content,
        "created-at": replyWithAuthor["created-at"],
        edited: replyWithAuthor.edited,
        "parent-comment-id": replyWithAuthor["parent-comment-id"],
        author: {
          id: replyWithAuthor.User.id,
          "full-name": `${replyWithAuthor.User["first-name"]} ${replyWithAuthor.User["last-name"]}`,
          email: replyWithAuthor.User.email,
        },
      },
    });
  } catch (error) {
    logger.error("----- [addReply] Error", {
      commentId: req.params.commentId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const editReply = async (req, res) => {
  logger.info("----- [editReply] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    logger.info("Edit reply attempt", { commentId, userId });

    const reply = await Comment.findByPk(commentId);
    if (!reply) {
      logger.warn("Reply not found for editing", { commentId, userId });
      return res.status(404).json({
        status: "error",
        message: "Reply not found",
      });
    }

    if (reply["author-id"] !== userId) {
      logger.warn("UNAUTHORIZED reply edit attempt", {
        commentId,
        userId,
        authorId: reply["author-id"],
      });
      return res.status(403).json({
        status: "error",
        message: "You can only edit your own replies",
      });
    }

    if (!content || content.trim().length === 0) {
      logger.warn("Empty reply content for edit", { commentId, userId });
      return res.status(400).json({
        status: "error",
        message: "Reply content is required",
      });
    }

    reply.content = content.trim();
    reply.edited = true;
    await reply.save();

    const updatedReply = await Comment.findByPk(commentId, {
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
    });

    logger.info("Reply updated successfully", { commentId, userId });

    logger.info("----- [editReply] END SUCCESS -----", {
      commentId,
      userId,
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Reply updated successfully",
      reply: {
        comment_id: updatedReply.comment_id,
        content: updatedReply.content,
        "created-at": updatedReply["created-at"],
        edited: updatedReply.edited,
        "parent-comment-id": updatedReply["parent-comment-id"],
        author: {
          id: updatedReply.User.id,
          "full-name": `${updatedReply.User["first-name"]} ${updatedReply.User["last-name"]}`,
          email: updatedReply.User.email,
        },
      },
    });
  } catch (error) {
    logger.error("----- [editReply] Error", {
      commentId: req.params.commentId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const deleteReply = async (req, res) => {
  logger.info("----- [deleteReply] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    logger.info("Delete reply attempt", { commentId, userId });

    const reply = await Comment.findByPk(commentId);
    if (!reply) {
      logger.warn("Reply not found for deletion", { commentId, userId });
      return res.status(404).json({
        status: "error",
        message: "Reply not found",
      });
    }

    if (reply["author-id"] !== userId) {
      logger.warn("UNAUTHORIZED reply deletion attempt", {
        commentId,
        userId,
        authorId: reply["author-id"],
      });
      return res.status(403).json({
        status: "error",
        message: "You can only delete your own replies",
      });
    }

    const postId = reply["post-id"];

    await reply.destroy();

    await Post.decrement("comments-count", {
      where: { post_id: postId },
    });

    logger.info("Reply deleted successfully", { commentId, userId, postId });

    logger.info("----- [deleteReply] END SUCCESS -----", {
      commentId,
      userId,
    });

    return res.status(200).json({
      status: HttpStatusHelper.SUCCESS,
      message: "Reply deleted successfully",
    });
  } catch (error) {
    logger.error("----- [deleteReply] Error", {
      commentId: req.params.commentId,
      userId: req.user.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: HttpStatusHelper.ERROR,
      message: error.message,
    });
  }
};

const getCommentReplies = async (req, res) => {
  logger.info("----- [getCommentReplies] START -----", {
    commentId: req.params.commentId,
    userId: req.user?.id,
  });

  try {
    const { commentId } = req.params;

    logger.info("Getting comment replies", { commentId, userId: req.user?.id });

    const parentComment = await Comment.findByPk(commentId);
    if (!parentComment) {
      logger.warn("Parent comment not found for replies", { commentId });
      return res.status(404).json({
        status: "error",
        message: "Parent comment not found",
      });
    }

    const replies = await Comment.findAll({
      where: { "parent-comment-id": commentId },
      include: [
        {
          model: User,
          attributes: ["id", "first-name", "last-name", "email"],
        },
      ],
      order: [["created-at", "ASC"]],
    });

    const responseData = replies.map((reply) => ({
      comment_id: reply.comment_id,
      content: reply.content,
      "created-at": reply["created-at"],
      edited: reply.edited,
      "parent-comment-id": reply["parent-comment-id"],
      author: {
        id: reply.User.id,
        "full-name": `${reply.User["first-name"]} ${reply.User["last-name"]}`,
        email: reply.User.email,
      },
    }));

    logger.info("Comment replies fetched successfully", {
      commentId,
      repliesCount: replies.length,
    });

    logger.info("----- [getCommentReplies] END SUCCESS -----", {
      commentId,
      repliesCount: responseData.length,
    });

    res.status(200).json({
      status: "success",
      message: "Comment replies fetched successfully",
      data: responseData,
    });
  } catch (error) {
    logger.error("----- [getCommentReplies] Error", {
      commentId: req.params.commentId,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    res.status(500).json({
      status: "error",
      message: "Failed to fetch comment replies: " + error.message,
      data: [],
    });
  }
};

const toggleLandingStatus = async (req, res) => {
  logger.info("----- [toggleLandingStatus] START -----", {
    postId: req.params.postId,
    userId: req.user?.id,
    userType: req.user?.["user-type"],
    inLanding: req.body.inLanding,
  });

  try {
    const { postId } = req.params;
    const { inLanding } = req.body;

    logger.info("Toggle landing status attempt", {
      postId,
      inLanding,
      userId: req.user?.id,
      userType: req.user?.["user-type"],
    });

    const allowedUserTypes = ["admin", "staff"];

    if (!req.user || !allowedUserTypes.includes(req.user["user-type"])) {
      logger.warn("UNAUTHORIZED toggle landing status attempt", {
        postId,
        userType: req.user ? req.user["user-type"] : "undefined",
      });
      return res.status(403).json({
        status: "error",
        message: "Access denied.",
      });
    }

    if (req.user["user-type"] === "staff") {
      const hasPermission = await checkStaffPermission(
        req.user.id,
        "Portal posts management",
        "edit"
      );

      if (!hasPermission) {
        logger.warn("STAFF PERMISSION DENIED for toggle landing status", {
          userId: req.user.id,
          postId,
          requiredPermission: "Portal posts management",
        });
        return res.status(403).json({
          status: "error",
          message:
            "Access denied. You don't have permission to manage landing posts.",
        });
      }
    }

    const post = await Post.findByPk(postId);
    if (!post) {
      logger.warn("Post not found for landing status toggle", { postId });
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const author = await User.findByPk(post["author-id"]);
    if (!author) {
      logger.error("Author not found for landing status toggle", {
        postId,
        authorId: post["author-id"],
      });
      return res.status(404).json({
        status: "error",
        message: "Author not found",
      });
    }

    if (
      author["user-type"] === "graduate" &&
      post.category !== "Success story" &&
      inLanding === true
    ) {
      logger.warn("Invalid landing page assignment for graduate", {
        postId,
        authorId: author.id,
        authorType: author["user-type"],
        category: post.category,
        requestedInLanding: inLanding,
      });
      return res.status(400).json({
        status: "error",
        message:
          "Only 'Success story' posts by graduates can appear on the landing page.",
      });
    }

    post["in-landing"] = inLanding;
    await post.save();

    logger.info("Landing status updated successfully", {
      postId,
      inLanding,
      userId: req.user.id,
      userType: req.user["user-type"],
      authorId: author.id,
      authorType: author["user-type"],
      category: post.category,
    });

    logger.info("----- [toggleLandingStatus] END SUCCESS -----", {
      postId,
      inLanding,
    });

    return res.status(200).json({
      status: "success",
      message: `Post landing status updated successfully.`,
      data: {
        post_id: post.post_id,
        "in-landing": post["in-landing"],
        category: post.category,
        author: {
          id: author.id,
          "user-type": author["user-type"],
        },
      },
    });
  } catch (error) {
    logger.error("----- [toggleLandingStatus] Error", {
      postId: req.params.postId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack.substring(0, 200),
    });

    return res.status(500).json({
      status: "error",
      message: "Server error",
      error: error.message,
    });
  }
};

const getLandingPosts = async (req, res) => {
  logger.info("----- [getLandingPosts] START -----", {
    userId: req.user?.id,
  });

  try {
    const currentUserId = req.user?.id || null;

    logger.info("Getting landing posts", { currentUserId });

    const posts = await Post.findAll({
      where: {
        "in-landing": true,
        "is-hidden": false,
      },
      include: [
        {
          model: Like,
          attributes: ["like_id", "user-id", "post-id"],
        },
        {
          model: PostImage,
          attributes: ["post_image_id", "image-url"],
        },
      ],
      order: [["created-at", "DESC"]],
    });

    if (posts.length === 0) {
      logger.info("No landing posts found");
      return res.status(200).json({
        status: "success",
        message: "No posts found",
        data: [],
      });
    }

    const postsWithDetails = await Promise.all(
      posts.map(async (post) => {
        const author = await User.findByPk(post["author-id"], {
          include: [
            {
              model: Graduate,
              attributes: ["profile-picture-url"],
            },
          ],
        });

        const likesCount = post.Likes ? post.Likes.length : 0;
        const isLikedByYou = currentUserId
          ? post.Likes?.some((like) => like["user-id"] === currentUserId) ||
            false
          : false;

        return {
          post_id: post.post_id,
          category: post.category,
          content: post.content,
          "created-at": post["created-at"],
          images: post.PostImages
            ? post.PostImages.map((img) => img["image-url"])
            : [],
          author: author
            ? {
                id: author.id,
                "full-name": `${author["first-name"]} ${author["last-name"]}`,
                email: author.email,
                image: author.Graduate
                  ? author.Graduate["profile-picture-url"]
                  : null,
              }
            : {
                id: post["author-id"],
                "full-name": "Unknown Author",
                email: null,
                image: null,
              },
          "group-id": post["group-id"],
          "in-landing": post["in-landing"],
          "is-hidden": post["is-hidden"],
          likesCount,
          isLikedByYou,
        };
      })
    );

    logger.info("Landing posts fetched successfully", {
      postsCount: postsWithDetails.length,
    });

    logger.info("----- [getLandingPosts] END SUCCESS -----", {
      postsCount: postsWithDetails.length,
    });

    res.status(200).json({
      status: "success",
      message: "Landing page posts fetched successfully",
      data: postsWithDetails,
    });
  } catch (error) {
    logger.error("----- [getLandingPosts] Error", {
      error: error.message,
      stack: error.stack.substring(0, 200),
      userId: req.user?.id,
    });

    res.status(500).json({
      status: "error",
      message: "Server error while fetching landing posts",
      error: {
        name: error.name,
        message: error.message,
      },
    });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getCategories,
  getAdminPosts,
  getGraduatePosts,
  getAllPostsOfUsers,
  editPost,
  getGroupPosts,
  likePost,
  unlikePost,
  addComment,
  editComment,
  deleteComment,
  deletePost,
  getPostWithDetails,
  hideNegativePost,
  unhidePost,
  getMyPosts,
  addReply,
  editReply,
  deleteReply,
  getCommentReplies,
  toggleLandingStatus,
  getLandingPosts,
};
