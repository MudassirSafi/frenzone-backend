const mongoose = require("mongoose")


const storySchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    likes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    content: { type: String, default: "" },
    contentType: {type: String, default: ""},
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 24* 60 * 60 * 1000);
      }
    },
    viewedBy: {
      type: [mongoose.Schema.Types.ObjectId], default: []
    }
  }, {
  timestamps: true
}
)

module.exports = mongoose.model("Story", storySchema)