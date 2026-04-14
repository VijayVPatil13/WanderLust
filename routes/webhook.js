const express = require("express");
const router = express.Router();

const wrapAsync = require("../utils/wrapAsync.js");
const bookingController = require("../controllers/booking.js");

router.post("/razorpay", wrapAsync(bookingController.handleRazorpayWebhook));

module.exports = router;
