const PERSONAL_DATA_BLOCK_CODE = 'PERSONAL_DATA_TEMPORARILY_UNAVAILABLE';
const PERSONAL_DATA_BLOCK_MESSAGE = 'This personal-data route is temporarily unavailable until verified worker identity is applied.';

function personalDataUnavailableError() {
  const error = new Error(PERSONAL_DATA_BLOCK_MESSAGE);
  error.statusCode = 403;
  error.code = PERSONAL_DATA_BLOCK_CODE;
  return error;
}

function blockPersonalDataRoute(req, res) {
  res.status(403).json({
    error: {
      code: PERSONAL_DATA_BLOCK_CODE,
      message: PERSONAL_DATA_BLOCK_MESSAGE,
      details: [],
    },
  });
}

// Evaluated as an identity argument so a handler cannot reach a data store
// with a client-chosen user id if the route gate is removed.
function refusePersonalDataChannelUserId() {
  throw personalDataUnavailableError();
}

module.exports = {
  PERSONAL_DATA_BLOCK_CODE,
  PERSONAL_DATA_BLOCK_MESSAGE,
  blockPersonalDataRoute,
  personalDataUnavailableError,
  refusePersonalDataChannelUserId,
};
