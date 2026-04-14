const mongoose = require("mongoose");
const crypto = require("crypto");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const { calculateBookingPrice } = require("../utils/pricingConfig.js");
const { formatCurrency } = require("../utils/currency.js");
const razorpay = require("../utils/razorpay.js");

const ONE_DAY_IN_MS = 1000 * 60 * 60 * 24;
const PAYMENT_WINDOW_IN_MS = 30 * 60 * 1000;

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

const ensureRazorpayConfig = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ExpressError(500, "Payment gateway is not configured.");
  }
};

const ensureWebhookConfig = () => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET && !process.env.RAZORPAY_KEY_SECRET) {
    throw new ExpressError(500, "Webhook secret is not configured.");
  }
};

const getPaymentDeadlineFromDate = (baseDate = new Date()) => {
  return new Date(new Date(baseDate).getTime() + PAYMENT_WINDOW_IN_MS);
};

const getStoredOrderId = (booking) => booking.razorpayOrderId || booking.paymentOrderId || null;

const setStoredOrderId = (booking, orderId) => {
  booking.razorpayOrderId = orderId;
  booking.paymentOrderId = orderId;
};

const appendPaymentAttempt = (booking, { orderId, paymentId = null, status }) => {
  if (!Array.isArray(booking.paymentAttempts)) {
    booking.paymentAttempts = [];
  }

  booking.paymentAttempts.push({
    orderId: orderId || null,
    paymentId,
    status,
    createdAt: new Date()
  });
};

const updatePaymentAttemptStatus = (booking, { orderId, paymentId = null, status }) => {
  if (!Array.isArray(booking.paymentAttempts)) {
    booking.paymentAttempts = [];
  }

  let attempt = null;

  for (let i = booking.paymentAttempts.length - 1; i >= 0; i--) {
    const candidate = booking.paymentAttempts[i];
    const sameOrder = orderId && candidate.orderId === orderId;
    const samePayment = paymentId && candidate.paymentId === paymentId;
    if (sameOrder || samePayment) {
      attempt = candidate;
      break;
    }
  }

  if (!attempt) {
    appendPaymentAttempt(booking, { orderId, paymentId, status });
    return;
  }

  attempt.status = status;
  if (orderId) attempt.orderId = orderId;
  if (paymentId) attempt.paymentId = paymentId;
  if (!attempt.createdAt) attempt.createdAt = new Date();
};

const hasPaymentPassedDeadline = (booking, now = new Date()) => {
  if (!booking.paymentDeadline) return false;
  return now.getTime() > new Date(booking.paymentDeadline).getTime();
};

const ensurePaymentDeadline = (booking) => {
  if (booking.paymentDeadline) return false;

  const baseDate = booking.createdAt || new Date();
  booking.paymentDeadline = getPaymentDeadlineFromDate(baseDate);
  return true;
};

const expireBookingIfNeeded = async (booking, now = new Date()) => {
  let changed = ensurePaymentDeadline(booking);

  const shouldExpire =
    booking.paymentStatus !== "paid" &&
    booking.paymentStatus !== "refunded" &&
    booking.status !== "cancelled" &&
    booking.status !== "expired" &&
    hasPaymentPassedDeadline(booking, now);

  if (shouldExpire) {
    booking.status = "expired";
    booking.expiredAt = now;
    changed = true;
  }

  if (changed) {
    await booking.save();
  }

  return booking.status === "expired";
};

const getPaymentRestriction = async (booking) => {
  await expireBookingIfNeeded(booking);

  if (booking.paymentStatus === "paid") {
    return { type: "paid", status: 200, message: "Booking is already paid." };
  }

  if (booking.paymentStatus === "refunded") {
    return { type: "refunded", status: 400, message: "Payment was refunded for this booking." };
  }

  if (booking.status === "cancelled") {
    return { type: "cancelled", status: 400, message: "Cancelled bookings cannot be paid." };
  }

  if (booking.status === "expired") {
    return { type: "expired", status: 400, message: "Booking payment window has expired.", expired: true };
  }

  return null;
};

const createOrderForBooking = async (booking) => {
  const now = new Date();
  const existingOrderId = getStoredOrderId(booking);

  if (
    existingOrderId &&
    booking.paymentStatus === "pending" &&
    booking.status !== "expired" &&
    !hasPaymentPassedDeadline(booking, now)
  ) {
    try {
      const existingOrder = await razorpay.orders.fetch(existingOrderId);
      if (existingOrder && existingOrder.id) {
        return { order: existingOrder, reused: true };
      }
    } catch (err) {
      // Existing order no longer retrievable, proceed with a fresh order.
    }
  }

  if (booking.paymentStatus === "failed") {
    booking.paymentStatus = "pending";
  }

  const order = await razorpay.orders.create({
    amount: Math.round(booking.totalPrice * 100),
    currency: "INR",
    receipt: booking._id.toString(),
    notes: {
      bookingId: booking._id.toString(),
      userId: booking.user.toString()
    }
  });

  setStoredOrderId(booking, order.id);
  booking.orderCreatedAt = now;
  appendPaymentAttempt(booking, {
    orderId: order.id,
    status: "created"
  });

  await booking.save();
  return { order, reused: false };
};

const markBookingAsPaid = (booking, { orderId, paymentId }) => {
  booking.paymentStatus = "paid";
  booking.status = "confirmed";
  booking.paymentId = paymentId;
  if (orderId) {
    setStoredOrderId(booking, orderId);
  }
  booking.paidAt = new Date();
  booking.expiredAt = undefined;

  updatePaymentAttemptStatus(booking, {
    orderId,
    paymentId,
    status: "success"
  });
};

const reconcilePendingPaymentFromGateway = async (booking) => {
  const orderId = getStoredOrderId(booking);
  if (!orderId || booking.paymentStatus !== "pending") {
    return false;
  }

  try {
    const orderPayments = await razorpay.orders.fetchPayments(orderId);
    const capturedPayment = Array.isArray(orderPayments.items)
      ? orderPayments.items.find((item) => item.status === "captured")
      : null;

    if (!capturedPayment) {
      return false;
    }

    markBookingAsPaid(booking, {
      orderId,
      paymentId: capturedPayment.id
    });

    await booking.save();
    return true;
  } catch (err) {
    return false;
  }
};

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
    Number.isNaN(checkInDate.getTime()) ||
    Number.isNaN(checkOutDate.getTime())
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
    status: { $nin: ["cancelled", "expired"] },
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
    paymentStatus: "pending",
    paymentDeadline: getPaymentDeadlineFromDate(new Date())
  });

  await booking.save();

  ensureRazorpayConfig();
  const { order } = await createOrderForBooking(booking);

  return res.render("bookings/checkout.ejs", {
    booking,
    order,
    key_id: process.env.RAZORPAY_KEY_ID,
    formatCurrency
  });
};

module.exports.getBookings = async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate("listing")
    .sort({ createdAt: -1 });

  for (const booking of bookings) {
    await expireBookingIfNeeded(booking);
  }

  return res.render("bookings/index.ejs", {
    bookings,
    formatCurrency,
    key_id: process.env.RAZORPAY_KEY_ID,
    now: new Date()
  });
};

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

  if (booking.status === "cancelled") {
    req.session.success = "Booking already cancelled.";
    return res.redirect("/bookings");
  }

  if (booking.paymentStatus === "paid") {
    if (booking.refundId || booking.paymentStatus === "refunded") {
      booking.paymentStatus = "refunded";
      booking.status = "cancelled";
      await booking.save();
      req.session.success = "Booking cancelled. Refund was already initiated.";
      return res.redirect("/bookings");
    }

    if (!booking.paymentId) {
      req.session.error = "Unable to process refund because payment record is missing.";
      return res.redirect("/bookings");
    }

    ensureRazorpayConfig();

    try {
      const refund = await razorpay.payments.refund(booking.paymentId, {
        notes: {
          bookingId: booking._id.toString(),
          reason: "booking_cancelled"
        }
      });

      booking.refundId = refund.id;
      booking.refundStatus = refund.status || "processed";
      booking.paymentStatus = "refunded";
    } catch (err) {
      req.session.error = "Refund could not be processed right now. Please try again.";
      return res.redirect("/bookings");
    }
  }

  booking.status = "cancelled";
  await booking.save();

  req.session.success = booking.paymentStatus === "refunded"
    ? "Booking cancelled and refund initiated successfully."
    : "Booking cancelled successfully.";

  return res.redirect("/bookings");
};

module.exports.createOrderForBookingPayment = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid booking id." });
  }

  const booking = await Booking.findOne({ _id: id, user: req.user._id });
  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const restriction = await getPaymentRestriction(booking);
  if (restriction) {
    if (restriction.type === "paid") {
      req.session.bookingSuccess = booking._id.toString();
      return res.json({
        success: true,
        alreadyPaid: true,
        message: restriction.message,
        redirectUrl: "/bookings/success"
      });
    }

    return res.status(restriction.status).json({
      success: false,
      message: restriction.message,
      expired: Boolean(restriction.expired)
    });
  }

  try {
    ensureRazorpayConfig();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  const { order, reused } = await createOrderForBooking(booking);

  return res.json({
    success: true,
    reused,
    key: process.env.RAZORPAY_KEY_ID,
    order: {
      id: order.id,
      amount: order.amount,
      currency: order.currency
    }
  });
};

module.exports.verifyPayment = async (req, res) => {
  const {
    bookingId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: "Invalid payment payload." });
  }

  try {
    ensureRazorpayConfig();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature !== razorpay_signature) {
    return res.status(400).json({ success: false, message: "Payment verification failed." });
  }

  let booking = null;

  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
  }

  if (!booking) {
    booking = await Booking.findOne({
      user: req.user._id,
      $or: [
        { razorpayOrderId: razorpay_order_id },
        { paymentOrderId: razorpay_order_id },
        { "paymentAttempts.orderId": razorpay_order_id }
      ]
    });
  }

  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const restriction = await getPaymentRestriction(booking);
  if (restriction) {
    if (restriction.type === "paid") {
      req.session.bookingSuccess = booking._id.toString();
      return res.json({
        success: true,
        alreadyPaid: true,
        message: restriction.message,
        redirectUrl: "/bookings/success"
      });
    }

    return res.status(restriction.status).json({
      success: false,
      message: restriction.message,
      expired: Boolean(restriction.expired)
    });
  }

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
  } catch (err) {
    return res.status(400).json({ success: false, message: "Unable to validate payment order." });
  }

  if (!razorpayOrder || razorpayOrder.receipt !== booking._id.toString()) {
    return res.status(400).json({ success: false, message: "Payment order mismatch." });
  }

  const expectedAmount = Math.round(booking.totalPrice * 100);
  if (Number(razorpayOrder.amount) !== expectedAmount || razorpayOrder.currency !== "INR") {
    return res.status(400).json({ success: false, message: "Payment amount mismatch." });
  }

  markBookingAsPaid(booking, {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id
  });

  await booking.save();

  req.session.bookingSuccess = booking._id.toString();
  req.session.success = "Payment successful! Booking confirmed.";

  return res.json({
    success: true,
    message: "Payment verified successfully.",
    redirectUrl: "/bookings/success"
  });
};

module.exports.markPaymentFailed = async (req, res) => {
  const { id } = req.params;
  const { razorpay_order_id, razorpay_payment_id } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid booking id." });
  }

  const booking = await Booking.findOne({ _id: id, user: req.user._id });
  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  const restriction = await getPaymentRestriction(booking);
  if (restriction) {
    if (restriction.type === "paid") {
      req.session.bookingSuccess = booking._id.toString();
      return res.json({ success: true, alreadyPaid: true, message: restriction.message });
    }

    return res.status(restriction.status).json({
      success: false,
      message: restriction.message,
      expired: Boolean(restriction.expired)
    });
  }

  if (razorpay_order_id) {
    setStoredOrderId(booking, razorpay_order_id);
  }

  booking.paymentStatus = "failed";
  updatePaymentAttemptStatus(booking, {
    orderId: razorpay_order_id || getStoredOrderId(booking),
    paymentId: razorpay_payment_id || null,
    status: "failed"
  });

  await booking.save();
  return res.json({ success: true, message: "Payment failed. Try again." });
};

module.exports.getPaymentStatus = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid booking id." });
  }

  const booking = await Booking.findOne({ _id: id, user: req.user._id });
  if (!booking) {
    return res.status(404).json({ success: false, message: "Booking not found." });
  }

  await expireBookingIfNeeded(booking);

  if (booking.status === "cancelled") {
    return res.status(400).json({ success: false, message: "Cancelled booking." });
  }

  if (booking.status === "expired") {
    return res.status(400).json({ success: false, message: "Booking payment window has expired.", expired: true });
  }

  let reconciled = false;

  if (booking.paymentStatus === "pending" && getStoredOrderId(booking)) {
    try {
      ensureRazorpayConfig();
      reconciled = await reconcilePendingPaymentFromGateway(booking);
    } catch (err) {
      reconciled = false;
    }
  }

  return res.json({
    success: true,
    reconciled,
    booking: {
      id: booking._id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      razorpayOrderId: getStoredOrderId(booking),
      paymentDeadline: booking.paymentDeadline,
      expiredAt: booking.expiredAt
    }
  });
};

module.exports.handleRazorpayWebhook = async (req, res) => {
  try {
    ensureWebhookConfig();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }

  const signature = req.get("x-razorpay-signature");
  const rawBody = req.rawBody;

  if (!signature || !rawBody) {
    return res.status(400).json({ success: false, message: "Invalid webhook request." });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expected !== signature) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature." });
  }

  const eventType = req.body && req.body.event;
  if (eventType !== "payment.captured") {
    return res.json({ received: true });
  }

  const paymentEntity = req.body?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id;

  if (!orderId || !paymentId) {
    return res.json({ received: true });
  }

  const booking = await Booking.findOne({
    $or: [
      { razorpayOrderId: orderId },
      { paymentOrderId: orderId },
      { "paymentAttempts.orderId": orderId }
    ]
  });

  if (!booking) {
    return res.json({ received: true });
  }

  if (booking.paymentStatus === "paid") {
    return res.json({ received: true, idempotent: true });
  }

  markBookingAsPaid(booking, { orderId, paymentId });
  await booking.save();

  return res.json({ received: true });
};

module.exports.showSuccess = async (req, res) => {
  const bookingId = req.session.bookingSuccess;
  if (!bookingId) {
    return res.redirect("/bookings");
  }

  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id }).populate("listing");

  delete req.session.bookingSuccess;

  if (!booking) {
    req.session.error = "Booking confirmation not found.";
    return res.redirect("/bookings");
  }

  return res.render("bookings/success.ejs", { booking, formatCurrency });
};

module.exports.expireUnpaidBookings = async () => {
  const now = new Date();

  const result = await Booking.updateMany(
    {
      paymentStatus: { $nin: ["paid", "refunded"] },
      status: { $nin: ["cancelled", "expired"] },
      paymentDeadline: { $lt: now }
    },
    {
      $set: {
        status: "expired",
        expiredAt: now
      }
    }
  );

  return result.modifiedCount || 0;
};
