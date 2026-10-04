const { handleErlcApiRequest } = require("../../server-erlc");

module.exports = async function handler(req, res) {
  return handleErlcApiRequest(req, res, (response, status, payload) => {
    return response.status(status).json(payload);
  });
};
