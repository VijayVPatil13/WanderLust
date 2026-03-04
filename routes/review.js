const express = require('express');
const mongoose = require("mongoose");
const router = express.Router({mergeParams: true});
const Listing = require('../models/listing.js'); 
const Review = require('../models/review.js');
const wrapAsync = require('../utils/wrapAsync.js');
const ExpressError = require('../utils/ExpressError.js');
const {validateReview} = require('../middleware.js');

//Review post route
router.post("/", validateReview, wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  const review = new Review(req.body.review);
  listing.reviews.push(review);
  await review.save();
  await listing.save();
  // req.flash("success", "New Review Created!");
  req.session.success = "New Review Created!";
  res.redirect(`/listings/${listing._id}`);
}));

//Review delete route
router.delete("/:reviewId", wrapAsync(async (req, res) => {
  const {id, reviewId} = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw new ExpressError(404, "Invalid Review ID");
  }
  const listing = await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) {
    throw new ExpressError(404, "Review Not Found");
  }
  // req.flash("success", "Review Deleted!");
  req.session.success = "Review Deleted!";
  res.redirect(`/listings/${id}`);
}));

module.exports = router;