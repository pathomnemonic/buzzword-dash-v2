/**
 * tipconfig.js: where the website's optional tip link lives.
 *
 * Put Dx Dash's own Stripe payment link here (https://buy.stripe.com/...). It is a public link, not a secret.
 * Leave it '' and no tip entry shows on the website.
 *
 * Dx Dash's tips are their own pot. Never put the PathoMnemonic Ko-fi page here: it is reserved for a different app
 * (tips.js refuses it). The phone apps do not use this link at all: they have the in-app tip jar (tipjar.js).
 */
export var TIP_PAYMENT_URL = '';
