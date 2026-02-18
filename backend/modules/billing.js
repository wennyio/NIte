const checkBilling = async (req, res, next) => {
  if (process.env.BILLING_STATUS !== 'active') return res.status(402).json({ error: 'Subscription inactive.' });
  next();
};
module.exports = { checkBilling };