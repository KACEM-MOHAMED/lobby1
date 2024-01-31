const mongoose = require("mongoose");

const roomMessageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  time: { type: Date, default: Date.now },
  senderID: String,
  room: String,
});

const RoomMessage = mongoose.model("RoomMessage", roomMessageSchema);

module.exports = RoomMessage;
