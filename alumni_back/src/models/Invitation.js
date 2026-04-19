const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');
const Group = require('./Group');

const Invitation = sequelize.define('Invitation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sender_id: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' } 
  },
  receiver_id: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' } 
  },
  group_id: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Group, key: 'id' } 
  },
  status: { 
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'cancelled'),
    defaultValue: 'pending' 
  },
  sent_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { 
  tableName: 'Invitation',
  timestamps: false
});

// علاقات User بالدعوات
User.hasMany(Invitation, { foreignKey: 'sender_id', as: 'sentInvitations' });
User.hasMany(Invitation, { foreignKey: 'receiver_id', as: 'receivedInvitations' });

// علاقة Group بالدعوات
Group.hasMany(Invitation, { foreignKey: 'group_id' });
Invitation.belongsTo(Group, { foreignKey: 'group_id' });

Invitation.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Invitation.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });


module.exports = Invitation;
