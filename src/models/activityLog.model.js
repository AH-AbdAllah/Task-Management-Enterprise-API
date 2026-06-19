const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    projectId: { type: String, index: true },
    projectName: { type: String },
    boardId: { type: String, index: true },
    boardName: { type: String },
    taskId: { type: String, index: true },
    taskTitle: { type: String },
    action: { type: String, required: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
