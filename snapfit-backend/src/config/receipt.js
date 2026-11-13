// The seller details printed on every subscription receipt. Address, email and
// website are optional and come from the server's .env. There is no payment
// gateway: receipts always state the demo payment method, never "Paid".
function receiptConfig() {
  return {
    company: 'SnapFit',
    address: process.env.RECEIPT_ADDRESS?.trim() || null,
    email: process.env.RECEIPT_EMAIL?.trim() || null,
    website: process.env.RECEIPT_WEBSITE?.trim() || null,
    currency: 'USD',
    taxRate: 0,
    paymentMethod: 'Demo (no charge)',
    footerNote: 'This receipt confirms a SnapFit subscription. No payment was charged (demo).',
    // The price note for a plan quoted per merchant (no list price).
    customPriceNote: 'Custom price as agreed',
  };
}

module.exports = { receiptConfig };
