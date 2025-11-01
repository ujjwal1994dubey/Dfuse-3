/**
 * Conversion Logger
 * Detailed logging for debugging state conversions
 */

let loggingEnabled = false;

export function enableConversionLogging() {
  loggingEnabled = true;
  console.log('📝 Conversion logging enabled');
}

export function disableConversionLogging() {
  loggingEnabled = false;
  console.log('📝 Conversion logging disabled');
}

export function logConversion(type, input, output) {
  if (!loggingEnabled) return;

  console.group(`🔄 ${type}`);
  console.log('Input:', input);
  console.log('Output:', output);
  console.groupEnd();
}

export function logError(context, error, data) {
  console.error(`❌ ${context}:`, error);
  if (data) {
    console.error('Related data:', data);
  }
}

export function logValidation(type, result) {
  if (!loggingEnabled) return;

  if (result.valid) {
    console.log(`✅ ${type} validation passed`);
  } else {
    console.warn(`⚠️  ${type} validation failed:`, result.error);
  }
}

