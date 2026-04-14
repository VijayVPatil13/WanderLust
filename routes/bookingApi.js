const express = require("express");
const router = express.Router();

const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controllers/booking.js");

router.post("/:id/create-order", isLoggedIn, wrapAsync(bookingController.createOrderForBookingPayment));
router.post("/verify-payment", isLoggedIn, wrapAsync(bookingController.verifyPayment));
router.post("/:id/payment-failed", isLoggedIn, wrapAsync(bookingController.markPaymentFailed));
router.get("/:id/payment-status", isLoggedIn, wrapAsync(bookingController.getPaymentStatus));

module.exports = router;
