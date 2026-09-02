require("dotenv").config();
const Review = require("../models/reviewModel")
const { catchAsyncError } = require("../helpers/catchAsyncError")
const { ApiFeatures } = require("../helpers/ApiFeatures")
const { sendRes, aws } = require("../helpers/otherHelpers")

const giveReview = async (req, res) => {
  try {
    const { userid, review, rating } = req.body;
    
    if (!userid || !review || !rating) {
      return sendRes(res, 400, false, "Missing required fields");
    }

    const reviewNew = await Review.create({
      userid,
      review,
      rating
    });

    sendRes(res, 200, true, reviewNew);
  } catch (error) {
    sendRes(res, 400, false, error.message);
  }
};

const getAllReviews = catchAsyncError(async (req, res, next) => {
    let apiFeature = new ApiFeatures(Review.find().populate({
        path: 'userid',
        select: 'username firstname lastname profilePicture'
      }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    const result = await apiFeature.mongooseQuery;
  
    var reviews = [];
    await Promise.all(
      result.map(async review => {
        if(review?.userid?.profilePicture){
          review.userid.profilePicture = await aws.getLinkFromAWS(review.userid.profilePicture);
        }
        // else{
        //   review.userid.profilePicture = ""
        // }
        reviews.push(review);
      })
    )
    res.status(201).json({ success: true, count, page: PAGE_NUMBER, reviews });
})

const getUserAllReviews = catchAsyncError(async (req, res, next) => {
    let apiFeature = new ApiFeatures(Review.find({userid: req.params.userid}).populate({
        path: 'userid',
        select: 'username firstname lastname profilePicture'
      }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    const result = await apiFeature.mongooseQuery;
  
    var reviews = [];
    await Promise.all(
      result.map(async review => {
        review.userid.profilePicture = await aws.getLinkFromAWS(review.userid.profilePicture);
        reviews.push(review);
      })
    )
    res.status(201).json({ success: true, count, page: PAGE_NUMBER, reviews });
})

// const getUserAllReviews = catchAsyncError(async (req, res, next) => {
//     let apiFeature = new ApiFeatures(Review.find({userid: req.params.userid}).populate({
//         path: 'userid',
//         select: 'username firstname lastname profilePicture'
//       }), req.query)
//     .filteration()
//     .search()
    
//     const count = await apiFeature.getTotalCount();
        
//     apiFeature.pagination().sort()
//     const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
//     const result = await apiFeature.mongooseQuery;
  
  
//     res.status(201).json({ success: true, count, page: PAGE_NUMBER, result });
// })

module.exports = {
  giveReview,
  getAllReviews,
  getUserAllReviews
};
