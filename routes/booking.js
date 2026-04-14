const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");

const bookingController = require("../controllers/booking.js");

// VERIFY PAYMENT
router.post("/verify-payment", isLoggedIn, wrapAsync(bookingController.verifyPayment));

// SUCCESS PAGE
router.get("/success", isLoggedIn, wrapAsync(bookingController.showSuccess));

// CREATE
router.post("/:listingId", isLoggedIn, wrapAsync(bookingController.createBooking));

// READ
router.get("/", isLoggedIn, wrapAsync(bookingController.getBookings));

// DELETE (cancel)
router.delete("/:id", isLoggedIn, wrapAsync(bookingController.cancelBooking));

module.exports = router;
