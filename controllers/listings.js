const Listing = require('../models/listing.js'); 
const Booking = require("../models/booking.js");
const mongoose = require("mongoose");
const ExpressError = require('../utils/ExpressError.js');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });
const filters = require("../utils/filters");
const pricingConfig = require('../utils/pricingConfig.js');
const { formatCurrency } = require("../utils/currency.js");

module.exports.index = async (req, res) => {
  const { search, location, minPrice, maxPrice, category } = req.query;
  const andConditions = [];

  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    andConditions.push({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { location: searchRegex },
        { country: searchRegex },
        { category: searchRegex }
      ]
    });
  }

  if (location && location.trim() !== "") {
    andConditions.push({ location: { $regex: location, $options: "i" } });
  }

  const min = parseInt(minPrice);
  const max = parseInt(maxPrice);

  if (!isNaN(min) || !isNaN(max)) {
    const priceQuery = {};
    if (!isNaN(min)) priceQuery.$gte = min;
    if (!isNaN(max)) priceQuery.$lte = max;
    andConditions.push({ price: priceQuery });
  }

  if (category) {
    const catRegex = new RegExp(category, "i");
    andConditions.push({
      $or: [
        { category: catRegex },
        { title: catRegex },
        { description: catRegex }
      ]
    });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};
  const listings = await Listing.find(query);
  res.render("listings/index.ejs", { listings, filters, req });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
}

module.exports.createListing = async (req, res) => {
  let response = await geocodingClient.forwardGeocode({
    query: req.body.listing.location,
    limit: 1
  }).send();
  let url = req.file.path;
  let filename = req.file.filename;
  const listing = new Listing(req.body.listing);
  listing.owner = req.user._id;
  listing.image = {url, filename};
  listing.geometry = response.body.features[0].geometry;
  let result = await listing.save();
  console.log(result);
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
  let originalImageUrl = listing.image.url;
  originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");
  res.render("listings/edit.ejs", { listing, originalImageUrl });
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
  if(typeof req.file !== "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = {url, filename};
    await listing.save();
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

  const bookings = await Booking.find({
    listing: listing._id,
    status: { $ne: "cancelled" }
  });

  const bookedDates = bookings
    .map((booking) => {
      if (!booking.checkIn || !booking.checkOut) return null;
      const from = booking.checkIn.toISOString().split("T")[0];
      const toDate = new Date(booking.checkOut);
      toDate.setUTCDate(toDate.getUTCDate() - 1);
      const to = toDate.toISOString().split("T")[0];
      return { from, to };
    })
    .filter(Boolean);

  res.render("listings/show.ejs", { listing, pricingConfig, formatCurrency, bookedDates });
}
