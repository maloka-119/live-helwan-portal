const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Post = require('./Post');

const PostImage = sequelize.define('PostImage', {
  post_image_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  'post-id': { type: DataTypes.INTEGER, references: { model: Post, key: 'post_id' } },
  'image-url': { type: DataTypes.STRING }
}, { tableName: 'PostImage', timestamps: false });

Post.hasMany(PostImage, { foreignKey: 'post-id' });
PostImage.belongsTo(Post, { foreignKey: 'post-id' });

module.exports = PostImage;
