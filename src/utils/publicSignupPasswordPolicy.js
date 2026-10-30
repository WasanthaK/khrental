// Shared public-signup policy: keep the form and redemption authority aligned.
export const PUBLIC_SIGNUP_PASSWORD_MIN=8;
export const PUBLIC_SIGNUP_PASSWORD_MAX=256;
export const PUBLIC_SIGNUP_PASSWORD_HINT='Use 8 to 256 characters. Spaces and longer phrases are welcome.';
export const isValidPublicSignupPassword=password=>typeof password==='string'&&
  password.length>=PUBLIC_SIGNUP_PASSWORD_MIN&&password.length<=PUBLIC_SIGNUP_PASSWORD_MAX;
