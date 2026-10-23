// The recipient rule shared by the expiry and stock emails (dispatch_set_warnings' and dispatch_set_stock_alerts' check).
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = s => typeof s === "string" && EMAIL.test(s.trim());
