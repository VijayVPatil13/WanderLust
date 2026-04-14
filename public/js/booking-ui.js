(() => {
  const bookingSection = document.querySelector(".booking-section-card");
  if (!bookingSection) return;

  const checkInInput = document.getElementById("checkIn");
  const checkOutInput = document.getElementById("checkOut");
  const guestsInput = document.getElementById("guests");
  const baseLineEl = document.getElementById("bookingBasePriceLine");
  const extraLineEl = document.getElementById("bookingExtraPriceLine");
  const extraNoteEl = document.getElementById("bookingExtraGuestNote");
  const totalEl = document.getElementById("bookingTotalDisplay");

  const nightlyPrice = Number(bookingSection.dataset.nightlyPrice || 0);
  const baseGuests = Number(bookingSection.dataset.baseGuests || 2);
  const extraGuestFee = Number(bookingSection.dataset.extraGuestFee || 300);
  const unavailableRanges = (typeof bookedDates !== "undefined" && Array.isArray(bookedDates) ? bookedDates : [])
    .map((range) => {
      if (!range || !range.from || !range.to) return null;
      return { from: range.from, to: range.to };
    })
    .filter(Boolean);

  if (!checkInInput || !checkOutInput || !guestsInput || !baseLineEl || !extraLineEl || !extraNoteEl || !totalEl) return;

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  }

  const parseDateInput = (value) => {
    if (!value || typeof value !== "string") return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
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

  const getNights = () => {
    const checkInDate = parseDateInput(checkInInput.value);
    const checkOutDate = parseDateInput(checkOutInput.value);
    if (!checkInDate || !checkOutDate) return 0;
    const ONE_DAY = 1000 * 60 * 60 * 24;
    const diff = Math.floor((checkOutDate - checkInDate) / ONE_DAY);
    return diff > 0 ? diff : 0;
  };

  const getGuests = () => {
    const parsedGuests = parseInt(guestsInput.value, 10);
    if (Number.isNaN(parsedGuests)) return 1;
    return parsedGuests < 1 ? 1 : parsedGuests;
  };

  const updateSummary = () => {
    const nights = getNights();
    const guests = getGuests();

    const baseTotal = nightlyPrice * nights;
    const hasExtraGuests = guests > baseGuests;
    const extraGuests = hasExtraGuests ? guests - baseGuests : 0;
    const extraTotal = extraGuests * extraGuestFee * nights;
    const totalPrice = baseTotal + extraTotal;

    baseLineEl.textContent = `${formatCurrency(nightlyPrice)} x ${nights} night${nights === 1 ? "" : "s"} = ${formatCurrency(baseTotal)}`;

    if (hasExtraGuests && nights > 0) {
      extraLineEl.textContent = `${formatCurrency(extraGuestFee)} x ${extraGuests} extra guest${extraGuests === 1 ? "" : "s"} x ${nights} night${nights === 1 ? "" : "s"} = ${formatCurrency(extraTotal)}`;
      extraLineEl.classList.remove("d-none");
      extraNoteEl.classList.remove("d-none");
    } else {
      extraLineEl.textContent = "";
      extraLineEl.classList.add("d-none");
      extraNoteEl.classList.add("d-none");
    }

    totalEl.textContent = formatCurrency(totalPrice);
  };

  const initFlatpickr = () => {
    if (typeof flatpickr !== "function") return;

    const checkoutPicker = flatpickr(checkOutInput, {
      dateFormat: "Y-m-d",
      minDate: "today",
      disable: unavailableRanges,
      disableMobile: true,
      onChange: updateSummary
    });

    flatpickr(checkInInput, {
      dateFormat: "Y-m-d",
      minDate: "today",
      disable: unavailableRanges,
      disableMobile: true,
      onChange: (selectedDates) => {
        if (selectedDates.length) {
          const minCheckout = new Date(selectedDates[0].getTime());
          minCheckout.setDate(minCheckout.getDate() + 1);
          checkoutPicker.set("minDate", minCheckout);
          if (parseDateInput(checkOutInput.value) && checkOutInput.value <= checkInInput.value) {
            checkoutPicker.clear();
          }
        }
        updateSummary();
      }
    });
  };

  checkInInput.addEventListener("input", updateSummary);
  checkOutInput.addEventListener("input", updateSummary);
  guestsInput.addEventListener("input", updateSummary);
  guestsInput.addEventListener("change", updateSummary);

  initFlatpickr();
  updateSummary();
})();
