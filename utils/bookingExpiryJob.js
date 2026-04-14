const bookingController = require("../controllers/booking.js");

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

let expiryIntervalRef = null;

const runExpirySweep = async () => {
  try {
    const expiredCount = await bookingController.expireUnpaidBookings();
    if (expiredCount > 0) {
      console.log(`[booking-expiry-job] Auto-expired ${expiredCount} booking(s).`);
    }
  } catch (err) {
    console.error("[booking-expiry-job] Failed:", err.message);
  }
};

module.exports.startBookingExpiryJob = () => {
  if (expiryIntervalRef) {
    return;
  }

  runExpirySweep();

  expiryIntervalRef = setInterval(runExpirySweep, FIVE_MINUTES_IN_MS);
  if (typeof expiryIntervalRef.unref === "function") {
    expiryIntervalRef.unref();
  }
};
