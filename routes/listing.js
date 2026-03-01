const express = require('express');
const mongoose = require("mongoose");
const router = express.Router();
const Listing = require('../models/listing.js'); 
const wrapAsync = require('../utils/wrapAsync.js');
const ExpressError = require('../utils/ExpressError.js');
const {listingSchema} = require('../schema.js');

const validateListing = (req, res, next) => {
  const { error } = listingSchema.validate(req.body);
  if (error) {
    const msg = error.details.map(el => el.message).join(",");
    throw new ExpressError(400, msg);
  } else {
    next();
  }
};

// Show all listings
router.get("/", wrapAsync(async (req, res) => {
  const listings = await Listing.find({});
  res.render("listings/index.ejs", { listings });
}));

// Create form
router.get("/new", (req, res) => {
  res.render("listings/new.ejs");
});

// Create listing
router.post("/", validateListing, wrapAsync(async (req, res) => {
  const listing = new Listing(req.body.listing);
  await listing.save();
  req.flash("success", "New Listing Created!");
  res.redirect("/listings");
}));

// Edit form
router.get("/:id/edit", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findById(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.render("listings/edit.ejs", { listing });
}));

// Update listing
router.put("/:id", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndUpdate(
    id,
    req.body.listing,
    { returnDocument: 'after', runValidators: true }
  );
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  req.flash("success", "Listing Updated!");
  res.redirect(`/listings/${req.params.id}`);
}));

// Delete listing
router.delete("/:id", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndDelete(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  req.flash("success", "Listing Deleted!");
  res.redirect("/listings");
}));

// Show one listing
router.get("/:id", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findById(id).populate('reviews');
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.render("listings/show.ejs", { listing });
}));

module.exports = router;