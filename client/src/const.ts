export { COOKIE_NAME } from "@shared/const";

// Send the visitor to the sign-in page. Call this from an event handler or effect, not during render.
export const startLogin = () => {
  window.location.href = "/auth";
};
