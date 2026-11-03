const rentalDate = document.querySelector('#rental-date');
const rentalHall = document.querySelector('#rental-hall');
const rentalGuests = document.querySelector('#rental-guests');
// Use Vermont's current date even when a visitor is in another time zone.
const dateParts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
const part = type => dateParts.find(p => p.type === type).value;
rentalDate.min = `${part('year')}-${part('month')}-${part('day')}`;
function validateCapacity() {
  const max = rentalHall.value === 'Half Hall' ? 125 : 360;
  rentalGuests.max = String(max);
  rentalGuests.setCustomValidity(Number(rentalGuests.value) > max ? `Please select a larger hall or enter no more than ${max} guests.` : '');
}
rentalHall.addEventListener('change', validateCapacity);
rentalGuests.addEventListener('input', validateCapacity);
