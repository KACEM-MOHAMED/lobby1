const mongoose = require("mongoose");

const userConnectionSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  connectionDate: {
    type: Date,
    default: Date.now,
  },
});

const UserConnection = mongoose.model("UserConnection", userConnectionSchema);

module.exports = UserConnection;
