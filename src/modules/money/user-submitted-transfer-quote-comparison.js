function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function isKnownDeliveryMethod(value) {
  return cleanText(value) !== '' && cleanText(value) !== 'unknown';
}

function hasMoneyValue(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameMoneyValue(left, right) {
  return hasMoneyValue(left) && hasMoneyValue(right) && left === right;
}

function isUserSubmittedQuote(quote = {}) {
  const trust = isObject(quote.sourceTrust) ? quote.sourceTrust : {};
  return trust.sourceType === 'user_submitted_quote' && trust.verificationStatus === 'user_reported';
}

function createProviderSummary(quote = {}) {
  const trust = isObject(quote.sourceTrust) ? quote.sourceTrust : {};

  return {
    providerId: cleanText(quote.providerId),
    providerName: cleanText(quote.providerName),
    sourceType: cleanText(trust.sourceType),
    verificationStatus: cleanText(trust.verificationStatus),
    freshnessStatus: cleanText(trust.freshnessStatus),
    quoteRetrievedAt: cleanText(quote.quoteRetrievedAt) || null,
    providerQuoteTimestamp: cleanText(quote.providerQuoteTimestamp) || null,
    userSubmittedAt: cleanText(trust.userSubmittedAt) || null,
  };
}

function createBaseComparison(quoteA = {}, quoteB = {}) {
  const recipientAmountA = hasMoneyValue(quoteA.recipientAmount) ? quoteA.recipientAmount : null;
  const recipientAmountB = hasMoneyValue(quoteB.recipientAmount) ? quoteB.recipientAmount : null;
  const hasBothRecipientAmounts = recipientAmountA !== null && recipientAmountB !== null;
  const feeKnownA = quoteA.transferFee !== null && quoteA.transferFee !== undefined;
  const feeKnownB = quoteB.transferFee !== null && quoteB.transferFee !== undefined;
  const totalCostKnownA = quoteA.totalCustomerCost !== null && quoteA.totalCustomerCost !== undefined;
  const totalCostKnownB = quoteB.totalCustomerCost !== null && quoteB.totalCustomerCost !== undefined;
  const deliveryA = cleanText(quoteA.deliveryMethod) || 'unknown';
  const deliveryB = cleanText(quoteB.deliveryMethod) || 'unknown';
  const bothDeliveryKnown = isKnownDeliveryMethod(deliveryA) && isKnownDeliveryMethod(deliveryB);
  const deliveryMethodMatch = bothDeliveryKnown ? deliveryA === deliveryB : null;
  const freshnessUnknown =
    cleanText(quoteA.sourceTrust?.freshnessStatus) === 'unknown'
    || cleanText(quoteB.sourceTrust?.freshnessStatus) === 'unknown'
    || !cleanText(quoteA.providerQuoteTimestamp)
    || !cleanText(quoteB.providerQuoteTimestamp);

  return {
    comparisonStatus: 'insufficient_data',
    providerA: createProviderSummary(quoteA),
    providerB: createProviderSummary(quoteB),
    sourceCurrency: normalizeCurrency(quoteA.sourceCurrency),
    targetCurrency: normalizeCurrency(quoteA.targetCurrency),
    sendAmount: hasMoneyValue(quoteA.sendAmount) ? quoteA.sendAmount : null,
    recipientAmountA,
    recipientAmountB,
    recipientAmountDifference: hasBothRecipientAmounts ? recipientAmountB - recipientAmountA : null,
    feeKnownA,
    feeKnownB,
    totalCostKnownA,
    totalCostKnownB,
    deliveryMethodMatch,
    freshnessWarning: freshnessUnknown
      ? 'Quote freshness is unknown because one or both user-reported quotes lack verified current provider timing.'
      : '',
    limitations: [],
  };
}

function compareUserSubmittedTransferQuotes(quoteA = {}, quoteB = {}) {
  const left = isObject(quoteA) ? quoteA : {};
  const right = isObject(quoteB) ? quoteB : {};
  const comparison = createBaseComparison(left, right);
  const limitations = [];

  if (!isUserSubmittedQuote(left) || !isUserSubmittedQuote(right)) {
    limitations.push('Both quotes must be normalized user-submitted quotes with user-reported verification status.');
    comparison.comparisonStatus = 'incompatible';
    comparison.limitations = limitations;
    return comparison;
  }

  const sourceCurrencyA = normalizeCurrency(left.sourceCurrency);
  const sourceCurrencyB = normalizeCurrency(right.sourceCurrency);
  const targetCurrencyA = normalizeCurrency(left.targetCurrency);
  const targetCurrencyB = normalizeCurrency(right.targetCurrency);

  if (!sourceCurrencyA || !targetCurrencyA || sourceCurrencyA !== sourceCurrencyB || targetCurrencyA !== targetCurrencyB) {
    limitations.push('Quotes use different or missing currency corridors and cannot be compared.');
    comparison.comparisonStatus = 'incompatible';
    comparison.limitations = limitations;
    return comparison;
  }

  if (!sameMoneyValue(left.sendAmount, right.sendAmount)) {
    limitations.push('Quotes use different or missing send amounts and cannot be compared.');
    comparison.comparisonStatus = 'incompatible';
    comparison.limitations = limitations;
    return comparison;
  }

  if (!hasMoneyValue(left.recipientAmount) || !hasMoneyValue(right.recipientAmount)) {
    limitations.push('Recipient amount difference cannot be calculated because one or both recipient amounts are missing.');
  }

  if (!comparison.feeKnownA || !comparison.feeKnownB) {
    limitations.push('One or both fees are unknown; missing fees are not treated as zero.');
  }

  if (!comparison.totalCostKnownA || !comparison.totalCostKnownB) {
    limitations.push('Total customer cost equivalence is not established because one or both total costs are unknown.');
  }

  const deliveryA = cleanText(left.deliveryMethod) || 'unknown';
  const deliveryB = cleanText(right.deliveryMethod) || 'unknown';
  const deliveryAKnown = isKnownDeliveryMethod(deliveryA);
  const deliveryBKnown = isKnownDeliveryMethod(deliveryB);

  if (!deliveryAKnown || !deliveryBKnown) {
    limitations.push('Delivery method equivalence is not established because one or both delivery methods are unknown.');
  } else if (deliveryA !== deliveryB) {
    limitations.push('Delivery methods differ, so the comparison is conditional on delivery-method differences.');
  }

  if (comparison.freshnessWarning) {
    limitations.push('Quote freshness remains unknown; user-reported quotes are not verified current provider offers.');
  }

  limitations.push('No provider availability, customer rate, missing fee, recipient amount, total cost, ranking, or financial recommendation is inferred.');

  if (!hasMoneyValue(left.recipientAmount) || !hasMoneyValue(right.recipientAmount)) {
    comparison.comparisonStatus = 'insufficient_data';
  } else if (!deliveryAKnown || !deliveryBKnown || deliveryA !== deliveryB) {
    comparison.comparisonStatus = 'conditional';
  } else {
    comparison.comparisonStatus = 'comparable';
  }

  comparison.limitations = limitations;
  return comparison;
}

module.exports = {
  compareUserSubmittedTransferQuotes,
  isUserSubmittedQuote,
};
