'use strict';

const { getEncoding } = require('js-tiktoken');

// gpt-4.1-mini uses the o200k_base encoding.
const ENCODING_NAME = 'o200k_base';
const TOKEN_SAFETY_MARGIN = 0.15;
const PER_MESSAGE_OVERHEAD_TOKENS = 8;
const REQUEST_FRAMING_OVERHEAD_TOKENS = 24;

let encoding;

function getO200kEncoding() {
  if (!encoding) encoding = getEncoding(ENCODING_NAME);
  return encoding;
}

function countTokens(text) {
  const value = String(text || '');
  if (!value) return 0;
  return getO200kEncoding().encode(value).length;
}

function extractRequestBodyText(requestBody) {
  let parsed = requestBody;
  if (typeof requestBody === 'string') {
    try {
      parsed = JSON.parse(requestBody);
    } catch (_) {
      return { text: String(requestBody || ''), messageCount: 0, parsed: null, parseError: true };
    }
  }
  parsed = parsed && typeof parsed === 'object' ? parsed : {};
  const parts = [];
  const input = Array.isArray(parsed.input) ? parsed.input : [];
  for (const item of input) {
    const content = item && item.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && part.text) parts.push(String(part.text));
      }
    } else if (typeof content === 'string') {
      parts.push(content);
    }
  }
  // Count the json_schema / text format as well as instructions and input.
  if (parsed.text != null) {
    parts.push(typeof parsed.text === 'string' ? parsed.text : JSON.stringify(parsed.text));
  }
  if (parsed.instructions) parts.push(String(parsed.instructions));
  return {
    text: parts.join('\n'),
    messageCount: input.length,
    parsed,
    parseError: false,
  };
}

function estimateInputTokens(requestBody, options = {}) {
  const margin = options.safetyMargin == null ? TOKEN_SAFETY_MARGIN : Number(options.safetyMargin);
  const perMessage = options.perMessageOverheadTokens == null ? PER_MESSAGE_OVERHEAD_TOKENS : Number(options.perMessageOverheadTokens);
  const framing = options.requestFramingOverheadTokens == null ? REQUEST_FRAMING_OVERHEAD_TOKENS : Number(options.requestFramingOverheadTokens);
  const extracted = extractRequestBodyText(requestBody);
  const extractedTokens = countTokens(extracted.text);
  const serialized = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody || {});
  const rawTokens = Math.max(extractedTokens, countTokens(serialized));
  const withMargin = Math.ceil(rawTokens * (1 + margin));
  const estimatedInputTokens = withMargin + framing + (extracted.messageCount * perMessage);
  return {
    encoding: ENCODING_NAME,
    rawTokens,
    safetyMargin: margin,
    perMessageOverheadTokens: perMessage,
    requestFramingOverheadTokens: framing,
    messageCount: extracted.messageCount,
    estimatedInputTokens,
    parseError: extracted.parseError,
  };
}

module.exports = {
  ENCODING_NAME,
  TOKEN_SAFETY_MARGIN,
  PER_MESSAGE_OVERHEAD_TOKENS,
  REQUEST_FRAMING_OVERHEAD_TOKENS,
  getO200kEncoding,
  countTokens,
  extractRequestBodyText,
  estimateInputTokens,
};
