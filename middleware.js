const Listing = require('./models/listing.js'); 
const ExpressError = require('./utils/ExpressError.js');
const {listingSchema, reviewSchema} = require('./schema.js');

const isLoggedIn = (req, res, next) => {
    if(!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        req.session.error = "You must be logged in!";
        return res.redirect("/login");
    }
    next();
}

const saveRedirectUrl = (req, res, next) => {
    if(req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
}

const isOwner = async(req, res, next) => {
    const { id } = req.params;
    let curListing = await Listing.findById(id);
    if(!curListing.owner._id.equals(res.locals.currUser._id)) {
        req.session.error = "You are authorized to perform this action!";
        return res.redirect(`/listings/${id}`);
    }
    next();
}

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

module.exports = {isLoggedIn, saveRedirectUrl, isOwner, validateListing, validateReview};