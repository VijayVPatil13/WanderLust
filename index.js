const express = require('express');
const mongoose = require("mongoose");
const Listing = require('./models/listing'); 
const Review = require('./models/review');
const wrapAsync = require('./utils/wrapAsync');
const ExpressError = require('./utils/ExpressError');
const {listingSchema, reviewSchema} = require('./schema.js');

const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');

const app = express();

const MONGO_URL = "mongodb://127.0.0.1:27017/listingsDB";

mongoose.connect(MONGO_URL)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Error:", err));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const validateListing = (req, res, next) => {
  const { error } = listingSchema.validate(req.body);
  if (error) {
    const msg = error.details.map(el => el.message).join(",");
    throw new ExpressError(400, msg);
  } else {
    next();
  }
};

const validateReview = (req, res, next) => {
  if (!req.body || !req.body.review) {
    throw new ExpressError(400, "Review body is required");
  }
  const { error } = reviewSchema.validate(req.body);
  if (error) {
    const msg = error.details.map(el => el.message).join(",");
    throw new ExpressError(400, msg);
  } else {
    next();
  }
};

// Redirect root
app.get('/', (req, res) => {
  res.redirect("/listings");
});

// Create form
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs");
});

// Create listing
app.post("/listings", validateListing, wrapAsync(async (req, res) => {
  const listing = new Listing(req.body.listing);
  await listing.save();
  res.redirect("/listings");
}));

// Edit form
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
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
app.put("/listings/:id", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndUpdate(
    id,
    req.body.listing,
    { new: true, runValidators: true }
  );
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.redirect(`/listings/${req.params.id}`);
}));

// Delete listing
app.delete("/listings/:id", wrapAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndDelete(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  res.redirect("/listings");
}));

// Show one listing
app.get("/listings/:id", wrapAsync(async (req, res) => {
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

//Review post route
app.post("/listings/:id/reviews", validateReview, wrapAsync(async (req, res) => {
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
  res.redirect(`/listings/${listing._id}`);
}));

//Review delete route
app.delete("/listings/:id/reviews/:reviewId", wrapAsync(async (req, res) => {
  const {id, reviewId} = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Page Not Found");
  }
  const listing = await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }
  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) {
    throw new ExpressError(404, "Review Not Found");
  }
  res.redirect(`/listings/${id}`);
}));

// Show all listings
app.get("/listings", wrapAsync(async (req, res) => {
  const listings = await Listing.find({});
  res.render("listings/index.ejs", { listings });
}));

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    err: { message: "Page Not Found" },
    status: 404
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Something went wrong";
  res.status(status).render("error.ejs", {
    err: { message },
    status
  });
});

app.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});