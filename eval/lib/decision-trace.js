'use strict';

function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  if (typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compact(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'replyMarkup' || key === 'inline_keyboard') continue;
    out[key] = compact(item, depth + 1);
  }
  return out;
}

function wrapExport(mod, name, fn) {
  const original = mod[name];
  if (typeof original !== 'function') return;
  mod[name] = fn(original);
}

function createDecisionTrace() {
  const steps = [];
  let rawModelOutput = null;

  function record(stage, details = {}) {
    steps.push({ stage, ...compact(details) });
  }

  function reset() {
    steps.length = 0;
    rawModelOutput = null;
  }

  function snapshot() {
    return {
      steps: steps.slice(),
      rawModelOutput: rawModelOutput ? compact(rawModelOutput) : null,
    };
  }

  function inferLegalTreatment() {
    const guard = [...steps].reverse().find((step) => step.stage === 'legal_output_filter' || step.stage === 'legal_reply_guard');
    if (guard && guard.replaced) return 'fallback';
    const legalAnswer = [...steps].reverse().find((step) => step.stage === 'legal_answer_for_clause');
    if (legalAnswer) return legalAnswer.approved ? 'approved_record' : 'fallback';
    const dual = [...steps].reverse().find((step) => step.stage === 'dual_gate');
    if (dual && (dual.action === 'menu' || dual.action === 'clarification' || dual.action === 'fallback')) {
      return dual.action === 'menu' ? 'menu' : dual.action;
    }
    const split = [...steps].reverse().find((step) => step.stage === 'mixed_split');
    if (split && split.kind === 'clarify') return 'clarification';
    const inputLegal = [...steps].reverse().find((step) => step.stage === 'legal_topic_detector' && (step.disposition === 'legal' || step.disposition === 'uncertain'));
    if (inputLegal) return 'input_gate';
    return 'unknown';
  }

  function installHooks() {
    const legalTopic = require('../../src/modules/knowledge-agent/legal-topic-detector');
    wrapExport(legalTopic, 'classifyUserQuestion', (original) => function wrappedClassify(text) {
      const result = original.apply(this, arguments);
      record('legal_topic_detector', {
        text: String(text || '').slice(0, 240),
        disposition: result && result.disposition,
        topic: result && result.topic,
        section: result && result.section,
        practical: result && result.practical,
        trafficking: result && result.trafficking,
        reason: 'code practical flags and legal/uncertain disposition (input gate)',
      });
      return result;
    });

    const mixed = require('../../src/modules/knowledge-agent/mixed-question-split');
    wrapExport(mixed, 'assessMixedSplit', (original) => function wrappedSplit(message) {
      const result = original.apply(this, arguments);
      record('mixed_split', {
        kind: result && result.kind,
        reason: result && result.reason,
        legalClause: result && result.legal && result.legal.clause,
        practicalClause: result && result.practical && result.practical.clause,
        clauseCount: result && result.clauses ? result.clauses.length : 0,
      });
      return result;
    });
    wrapExport(mixed, 'legalAnswerForClause', (original) => function wrappedLegalAnswer() {
      const result = original.apply(this, arguments);
      record('legal_answer_for_clause', {
        approved: Boolean(result && result.approved),
        replyPreview: result && result.reply,
        treatment: result && result.approved ? 'approved_record' : 'fallback',
      });
      return result;
    });

    const dualGate = require('../../src/modules/ai-provider/dual-gate');
    wrapExport(dualGate, 'parseModelReply', (original) => function wrappedParse(text, meta) {
      const result = original.apply(this, arguments);
      record('parse_model_reply', {
        ok: result && result.ok,
        reason: result && result.reason,
        fields: result && result.value,
      });
      if (result && result.ok && result.value) {
        rawModelOutput = { jsonFields: result.value, rawText: String(text || '') };
      } else {
        rawModelOutput = { jsonFields: null, rawText: String(text || ''), parseReason: result && result.reason, meta };
      }
      return result;
    });
    wrapExport(dualGate, 'decideDualGate', (original) => function wrappedDecide(args) {
      const result = original.apply(this, arguments);
      record('dual_gate', {
        action: result && result.action,
        clarificationKind: result && result.clarificationKind,
        domain: result && result.domain,
        reason: result && result.reason,
        classification: args && args.classification,
        practicalFlags: args && args.practical,
        disposition: args && args.disposition,
      });
      return result;
    });

    const practicalClar = require('../../src/modules/ai-provider/practical-clarification');
    wrapExport(practicalClar, 'formatPracticalClarification', (original) => function wrappedPracticalClar(domain, lang) {
      const result = original.apply(this, arguments);
      record('practical_clarification', {
        domain: result && result.domain,
        language: result && result.language,
        machineTranslated: Boolean(result && result.machineTranslated),
        nativeReviewRequired: Boolean(result && result.nativeReviewRequired),
        replyPreview: result && result.reply,
      });
      return result;
    });

    const legalGuard = require('../../src/modules/knowledge-agent/legal-question-guard');
    wrapExport(legalGuard, 'looksLikeLegalOrRightsQuestion', (original) => function wrappedLooks(text) {
      const result = original.apply(this, arguments);
      record('legal_input_filter', {
        text: String(text || '').slice(0, 240),
        blocked: Boolean(result),
        reason: result ? 'looksLikeLegalOrRightsQuestion=true' : 'looksLikeLegalOrRightsQuestion=false',
      });
      return result;
    });
    wrapExport(legalGuard, 'guardGeneratedLegalOutput', (original) => function wrappedGuard(text, options) {
      const result = original.apply(this, arguments);
      const originalText = String(text || '');
      const guarded = String(result || '');
      record('legal_output_filter', {
        replaced: guarded !== originalText,
        reason: guarded !== originalText ? 'guardGeneratedLegalOutput replaced or blocked the text' : 'guardGeneratedLegalOutput left the text unchanged',
        outputPreview: guarded,
      });
      return result;
    });
    wrapExport(legalGuard, 'guardLegalReply', (original) => function wrappedLegalReply(text, options) {
      const result = original.apply(this, arguments);
      record('legal_reply_guard', {
        replaced: String(result || '') !== String(text || ''),
        reason: 'guardLegalReply',
        outputPreview: result,
      });
      return result;
    });

    const openaiProvider = require('../../src/modules/ai-provider/openai.provider');
    wrapExport(openaiProvider, 'createResponse', (original) => async function wrappedCreate() {
      const result = await original.apply(this, arguments);
      if (result && result.classification) {
        rawModelOutput = {
          jsonFields: result.classification,
          model: result.model,
          provider: result.provider,
          usage: result.usage || null,
        };
        record('model_raw_output', { jsonFields: result.classification, model: result.model, usage: result.usage || null });
      }
      return result;
    });
  }

  return {
    record,
    reset,
    snapshot,
    inferLegalTreatment,
    installHooks,
    get rawModelOutput() { return rawModelOutput; },
  };
}

module.exports = {
  createDecisionTrace,
};
