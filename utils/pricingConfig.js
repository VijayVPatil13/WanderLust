const BASE_INCLUDED_GUESTS = 2;
const EXTRA_GUEST_FEE = 300;

const calculateBookingPrice = ({ nightlyPrice, totalNights, totalGuests }) => {
  let totalPrice = totalNights * nightlyPrice;

  if (totalGuests > BASE_INCLUDED_GUESTS) {
    const extraGuests = totalGuests - BASE_INCLUDED_GUESTS;
    totalPrice += extraGuests * EXTRA_GUEST_FEE * totalNights;
  }

  return totalPrice;
};

module.exports = {
  BASE_INCLUDED_GUESTS,
  EXTRA_GUEST_FEE,
  calculateBookingPrice
};
