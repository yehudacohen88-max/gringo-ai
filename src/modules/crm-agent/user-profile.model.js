const USER_PROFILE_FIELDS = [
  'userId',
  'channel',
  'channelUserId',
  'fullName',
  'language',
  'country',
  'city',
  'profession',
  'workSector',
  'currentEmployer',
  'interests',
  'preferredCurrency',
  'moneyTransferCountry',
  'lastQuestion',
  'lastCategory',
  'lastInteractionAt',
  'createdAt',
  'updatedAt',
];

const USER_PROFILE_DEFAULTS = {
  channel: 'internal',
  channelUserId: '',
  fullName: '',
  language: '',
  country: '',
  city: '',
  profession: '',
  workSector: '',
  currentEmployer: '',
  interests: '',
  preferredCurrency: '',
  moneyTransferCountry: '',
  lastQuestion: '',
  lastCategory: '',
  lastInteractionAt: '',
};

module.exports = {
  USER_PROFILE_DEFAULTS,
  USER_PROFILE_FIELDS,
};
