const HOUSING_FIELDS = [
  'housingId',
  'title',
  'housingType',
  'city',
  'area',
  'addressText',
  'monthlyPrice',
  'billsIncluded',
  'depositAmount',
  'availableFrom',
  'numberOfBeds',
  'numberOfRooms',
  'sharedWithOthers',
  'preferredAudience',
  'description',
  'contactName',
  'contactMethod',
  'contactValue',
  'status',
  'createdAt',
  'updatedAt',
];

const HOUSING_TYPES = ['Room', 'Shared Room', 'Apartment', 'Bed Space', 'Employer Housing', 'Other'];
const HOUSING_STATUSES = ['Active', 'Rented', 'Archived'];

module.exports = {
  HOUSING_FIELDS,
  HOUSING_STATUSES,
  HOUSING_TYPES,
};
