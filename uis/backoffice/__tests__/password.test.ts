import { validateNewPassword } from "../lib/password";

describe("validateNewPassword", () => {
  it("accepts matching passwords within the API limits", () => {
    expect(validateNewPassword("ValidPass1!", "ValidPass1!")).toBeNull();
    expect(validateNewPassword("é".repeat(36), "é".repeat(36))).toBeNull();
  });

  it.each([
    ["short", "short", "Password must be at least 8 characters."],
    ["ValidPass1!", "DifferentPass1!", "Passwords do not match."],
    ["é".repeat(37), "é".repeat(37), "Password must be at most 72 bytes."],
  ])("rejects invalid password input", (password, confirmation, message) => {
    expect(validateNewPassword(password, confirmation)).toBe(message);
  });
});