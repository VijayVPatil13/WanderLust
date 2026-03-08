const Listing = require('../models/listing.js'); 
const mongoose = require("mongoose");
const ExpressError = require('../utils/ExpressError.js');

module.exports.index = async (req, res) => {
  const listings = await Listing.find({});
  res.render("listings/index.ejs", { listings });
}

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
}

module.exports.createListing = async (req, res) => {
  let url = req.file.path;
  let filename = req.file.filename;
  const listing = new Listing(req.body.listing);
  listing.owner = req.user._id;
  listing.image = {url, filename};
  await listing.save();
  // req.flash("success", "New Listing Created!");
  req.session.success = "New Listing Created!";
  res.redirect("/listings");
}

module.exports.renderEditForm = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findById(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.render("listings/edit.ejs", { listing });
}

module.exports.updateListing = async (req, res) => {
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
  // req.flash("success", "Listing Updated!");
  req.session.success = "Listing Updated!";
  res.redirect(`/listings/${id}`);
}

module.exports.destroyListing = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndDelete(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  // req.flash("success", "Listing Deleted!");
  req.session.success = "Listing Deleted!";
  res.redirect("/listings");
}

module.exports.showListing = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findById(id)
    .populate({
      path: 'reviews', 
      populate: {
        path: 'author'
      }
    })
    .populate('owner');
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.render("listings/show.ejs", { listing });
}