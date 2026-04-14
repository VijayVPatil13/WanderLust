const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const paymentAttemptSchema = new Schema(
  {
    orderId: {
      type: String
    },
    paymentId: {
      type: String
    },
    status: {
      type: String,
      enum: ["created", "success", "failed"],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    checkIn: {
      type: Date,
      required: true
    },
    checkOut: {
      type: Date,
      required: true
    },
    guests: {
      type: Number,
      default: 1,
      min: 1
    },
    totalPrice: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired"],
      default: "pending"
    },
    paymentId: {
      type: String
    },
    razorpayOrderId: {
      type: String
    },
    paymentOrderId: {
      type: String
    },
    orderCreatedAt: {
      type: Date
    },
    paymentDeadline: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000)
    },
    expiredAt: {
      type: Date
    },
    paymentAttempts: {
      type: [paymentAttemptSchema],
      default: []
    },
    paidAt: {
      type: Date
    },
    refundId: {
      type: String
    },
    refundStatus: {
      type: String
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
