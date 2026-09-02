const Report = require("../models/reportModel");
const User = require("../models/userModel");
const reportUser = async (req, res) => {
  try {
    const { reportedUserId, reportedById, reason } = req.body;
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ error: "Reported user not found" });
    }
    const reportedByUser = await User.findById(reportedById);
    if (!reportedByUser) {
      return res.status(404).json({ error: "User who is reporting not found" });
    }
    const report = new Report({
      reportedUser: reportedUserId,
      reportedBy: reportedById,
      reason,
    });
    await report.save();
    res.status(200).json({ message: "User reported successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const getReportedUserById = async (req, res) => {
  try {
    const { userid } = req.params;
    const reports = await Report.find({ reportedUser: userid })
      .populate("reportedUser", "username")
      .populate("reportedBy", "username")
      .exec();

    if (!reports.length) {
      return res.status(404).json({
        message: "No reports found for this user",
      });
    }

    const reportsWithDuration = reports.map((report) => {
      const reportedAt = new Date(report.reportedAt);
      const currentTime = new Date();
      const differenceInTime = currentTime - reportedAt;
      const differenceInDays = Math.floor(
        differenceInTime / (1000 * 60 * 60 * 24)
      );

      let reportedDuration;

      if (differenceInDays === 0) {
        reportedDuration = "today";
      } else if (differenceInDays === 1) {
        reportedDuration = "1 day ago";
      } else {
        reportedDuration = `${differenceInDays} days ago`;
      }

      return {
        reportedUserId: report.reportedUser._id,
        reportedUser: report.reportedUser.username,
        reportedBy: report.reportedBy.username,
        reason: report.reason,
        reportedAt: report.reportedAt,
        reportedDuration: reportedDuration,
      };
    });

    res.status(200).json({
      reports: reportsWithDuration,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

const removeReportedUser = async (req, res) => {
  try {
    const { reportedUserId } = req.params;
    const result = await Report.deleteMany({ reportedUser: reportedUserId });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "No reports found for the specified user" });
    }
    res
      .status(200)
      .json({ message: "Reports for the user removed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = {
  reportUser,
  getReportedUserById,
  removeReportedUser,
};
