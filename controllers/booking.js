const mongoose = require("mongoose");
const crypto = require("crypto");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const { calculateBookingPrice } = require("../utils/pricingConfig.js");
const { formatCurrency } = require("../utils/currency.js");
const razorpay = require("../utils/razorpay.js");

const ONE_DAY_IN_MS = 1000 * 60 * 60 * 24;

const parseDateInput = (dateValue) => {
  if (typeof dateValue !== "string") return null;
  const parts = dateValue.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

const calculateNights = (checkIn, checkOut) => {
  return Math.floor((checkOut - checkIn) / ONE_DAY_IN_MS);
};

// 🟢 CREATE BOOKING
module.exports.createBooking = async (req, res) => {
  const { listingId } = req.params;
  const { checkIn, checkOut, guests } = req.body;

  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    throw new ExpressError(404, "Listing Not Found");
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found");
  }

  if (!checkIn || !checkOut) {
    req.session.error = "Check-in and check-out dates are required.";
    return res.redirect(`/listings/${listingId}`);
  }

  const checkInDate = parseDateInput(checkIn);
  const checkOutDate = parseDateInput(checkOut);

  if (
    !checkInDate ||
    !checkOutDate ||
    isNaN(checkInDate.getTime()) ||
    isNaN(checkOutDate.getTime())
  ) {
    req.session.error = "Please provide valid booking dates.";
    return res.redirect(`/listings/${listingId}`);
  }

  if (checkOutDate <= checkInDate) {
    req.session.error = "Check-out date must be after check-in date.";
    return res.redirect(`/listings/${listingId}`);
  }

  const totalNights = calculateNights(checkInDate, checkOutDate);
  if (totalNights <= 0) {
    req.session.error = "Invalid booking duration.";
    return res.redirect(`/listings/${listingId}`);
  }

  const parsedGuests = parseInt(guests, 10);
  const totalGuests = Number.isNaN(parsedGuests) ? 1 : parsedGuests;

  if (totalGuests < 1) {
    req.session.error = "Guests must be at least 1.";
    return res.redirect(`/listings/${listingId}`);
  }

  const overlappingBooking = await Booking.findOne({
    listing: listingId,
    status: { $ne: "cancelled" },
    checkIn: { $lt: checkOutDate },
    checkOut: { $gt: checkInDate }
  });

  if (overlappingBooking) {
    req.session.error = "Selected dates are unavailable.";
    return res.redirect(`/listings/${listingId}`);
  }

  const booking = new Booking({
    listing: listing._id,
    user: req.user._id,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    guests: totalGuests,
    totalPrice: calculateBookingPrice({
      nightlyPrice: listing.price,
      totalNights,
      totalGuests
    }),
    status: "pending",
    paymentStatus: "pending"
  });

  // TODO: Payment integration (Razorpay/Stripe)
  // Keep booking status pending until payment succeeds.
  await booking.save();
  const order = await razorpay.orders.create({
    amount: Math.round(booking.totalPrice * 100),
    currency: "INR",
    receipt: booking._id.toString()
  });

  booking.paymentId = order.id;
  await booking.save();

  res.render("bookings/checkout.ejs", {
    booking,
    order,
    key_id: process.env.RAZORPAY_KEY_ID,
    formatCurrency
  });
};

// 🟢 GET BOOKINGS
module.exports.getBookings = async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate("listing")
    .sort({ createdAt: -1 });

  res.render("bookings/index.ejs", { bookings, formatCurrency });
};

// 🟢 CANCEL BOOKING
module.exports.cancelBooking = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(404, "Booking Not Found");
  }

  const booking = await Booking.findOne({ _id: id, user: req.user._id });

  if (!booking) {
    req.session.error = "Booking not found.";
    return res.redirect("/bookings");
  }

  booking.status = "cancelled";
  await booking.save();

  req.session.success = "Booking cancelled successfully.";
  res.redirect("/bookings");
};

module.exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: "Invalid payment payload." });
  }

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false, message: "Payment verification failed." });
  }

  const booking = await Booking.findOne({
    user: req.user._id,
    $or: [
      { paymentId: razorpay_order_id },
      { paymentId: razorpay_payment_id }
    ]
  });

  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  if (booking.paymentStatus === "paid") {
    req.session.bookingSuccess = booking._id.toString();
    return res.json({ success: true, redirectUrl: "/bookings/success" });
  }

  if (booking.paymentId !== razorpay_order_id) {
    return res.status(400).json({ success: false, message: "Payment verification failed." });
  }

  booking.paymentStatus = "paid";
  booking.status = "confirmed";
  booking.paymentId = razorpay_payment_id;
  await booking.save();

  req.session.bookingSuccess = booking._id.toString();
  req.session.success = "Payment successful! Booking confirmed.";
  return res.json({ success: true, redirectUrl: "/bookings/success" });
};

module.exports.showSuccess = async (req, res) => {
  const bookingId = req.session.bookingSuccess;
  if (!bookingId) {
    return res.redirect("/bookings");
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    user: req.user._id
  }).populate("listing");

  delete req.session.bookingSuccess;

  if (!booking) {
    req.session.error = "Booking confirmation not found.";
    return res.redirect("/bookings");
  }

  res.render("bookings/success.ejs", { booking, formatCurrency });
};
