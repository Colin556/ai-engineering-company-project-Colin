const cityMap = {
  Colombia: ["Medellín", "Bogotá", "Cali"],
  "United States": ["Miami", "Orlando"]
};

const locationMap = {
  Colombia: {
    Medellín: [
      "Brasaland El Poblado",
      "Brasaland Laureles",
      "Brasaland Envigado",
      "Brasaland Sabaneta"
    ],
    Bogotá: ["Brasaland Usaquén", "Brasaland Chapinero", "Brasaland Zona Rosa"],
    Cali: ["Brasaland Granada", "Brasaland Ciudad Jardín", "Brasaland Unicentro"]
  },
  "United States": {
    Miami: ["Brasaland Brickell", "Brasaland Coral Gables"],
    Orlando: ["Brasaland Downtown", "Brasaland International Drive"]
  }
};

const errorMessages = {
  fullName: "Enter your full name (first and last name)",
  email: "Enter a valid email (example: name@email.com)",
  phone: "Phone must include country code (example: +57 300 123 4567 or +1 305 123 4567)",
  country: "Select your country",
  city: "Select your city",
  howFound: "Tell us how you found Brasaland",
  dateOfBirth: "You must be 18 or older to register for Brasa Points",
  terms: "You must accept the Brasa Points program terms to continue"
};

const form = document.getElementById("brasa-form");

if (form) {
  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const countrySelect = document.getElementById("country");
  const citySelect = document.getElementById("city");
  const favoriteLocationSelect = document.getElementById("favoriteLocation");
  const howFoundSelect = document.getElementById("howFound");
  const dateOfBirthInput = document.getElementById("dateOfBirth");
  const termsCheckbox = document.getElementById("terms");
  const successMessage = document.getElementById("success-message");
  const summaryError = document.getElementById("form-summary-error");

  const fieldMap = {
    fullName: fullNameInput,
    email: emailInput,
    phone: phoneInput,
    country: countrySelect,
    city: citySelect,
    howFound: howFoundSelect,
    dateOfBirth: dateOfBirthInput,
    terms: termsCheckbox
  };

  function setFieldError(fieldKey, message) {
    const field = fieldMap[fieldKey];
    const errorElement = document.getElementById(`${fieldKey}-error`);

    if (!field || !errorElement) {
      return;
    }

    field.setAttribute("aria-invalid", "true");
    if (field.type === "checkbox") {
      field.classList.add("ring-2", "ring-red-400");
    } else {
      field.classList.add("border-red-400");
    }
    errorElement.textContent = message;
  }

  function clearFieldError(fieldKey) {
    const field = fieldMap[fieldKey];
    const errorElement = document.getElementById(`${fieldKey}-error`);

    if (!field || !errorElement) {
      return;
    }

    field.removeAttribute("aria-invalid");
    field.classList.remove("border-red-400", "ring-2", "ring-red-400");
    errorElement.textContent = "";
  }

  function resetErrors() {
    Object.keys(fieldMap).forEach((key) => clearFieldError(key));
    summaryError.textContent = "";
    summaryError.classList.add("hidden");
    successMessage.classList.add("hidden");
    successMessage.textContent = "";
  }

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function populateCities() {
    const country = countrySelect.value;
    citySelect.innerHTML = "";
    citySelect.appendChild(createOption("", "Select city"));

    favoriteLocationSelect.innerHTML = "";
    favoriteLocationSelect.appendChild(createOption("", "Select favorite location (optional)"));
    favoriteLocationSelect.disabled = true;

    if (!country || !cityMap[country]) {
      citySelect.disabled = true;
      return;
    }

    cityMap[country].forEach((city) => {
      citySelect.appendChild(createOption(city, city));
    });

    citySelect.disabled = false;
  }

  function populateFavoriteLocations() {
    const country = countrySelect.value;
    const city = citySelect.value;

    favoriteLocationSelect.innerHTML = "";
    favoriteLocationSelect.appendChild(createOption("", "Select favorite location (optional)"));

    if (!country || !city || !locationMap[country] || !locationMap[country][city]) {
      favoriteLocationSelect.disabled = true;
      return;
    }

    locationMap[country][city].forEach((location) => {
      favoriteLocationSelect.appendChild(createOption(location, location));
    });

    favoriteLocationSelect.disabled = false;
  }

  function isAdult(dateString) {
    if (!dateString) {
      return false;
    }

    const birthDate = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) {
      return false;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age >= 18;
  }

  function isValidPhone(phone, country) {
    const normalizedPhone = phone.trim();
    const phonePattern = /^\+\d{1,3}\s[\d\s-]{6,}$/;

    if (!phonePattern.test(normalizedPhone)) {
      return false;
    }

    if (country === "Colombia") {
      return normalizedPhone.startsWith("+57");
    }

    if (country === "United States") {
      return normalizedPhone.startsWith("+1");
    }

    return false;
  }

  function isValidFullName(fullName) {
    const parts = fullName
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);

    return parts.length >= 2;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function hideSuccessMessage() {
    successMessage.classList.add("hidden");
    successMessage.textContent = "";
  }

  function getValues() {
    return {
      fullName: fullNameInput.value,
      email: emailInput.value,
      phone: phoneInput.value,
      country: countrySelect.value,
      city: citySelect.value,
      howFound: howFoundSelect.value,
      dateOfBirth: dateOfBirthInput.value,
      terms: termsCheckbox.checked
    };
  }

  function validateField(fieldKey, values) {
    switch (fieldKey) {
      case "fullName":
        if (!isValidFullName(values.fullName)) {
          setFieldError("fullName", errorMessages.fullName);
          return false;
        }
        clearFieldError("fullName");
        return true;

      case "email":
        if (!isValidEmail(values.email)) {
          setFieldError("email", errorMessages.email);
          return false;
        }
        clearFieldError("email");
        return true;

      case "phone":
        if (!isValidPhone(values.phone, values.country)) {
          setFieldError("phone", errorMessages.phone);
          return false;
        }
        clearFieldError("phone");
        return true;

      case "country":
        if (!values.country) {
          setFieldError("country", errorMessages.country);
          return false;
        }
        clearFieldError("country");
        return true;

      case "city":
        if (!values.city) {
          setFieldError("city", errorMessages.city);
          return false;
        }
        clearFieldError("city");
        return true;

      case "howFound":
        if (!values.howFound) {
          setFieldError("howFound", errorMessages.howFound);
          return false;
        }
        clearFieldError("howFound");
        return true;

      case "dateOfBirth":
        if (!isAdult(values.dateOfBirth)) {
          setFieldError("dateOfBirth", errorMessages.dateOfBirth);
          return false;
        }
        clearFieldError("dateOfBirth");
        return true;

      case "terms":
        if (!values.terms) {
          setFieldError("terms", errorMessages.terms);
          return false;
        }
        clearFieldError("terms");
        return true;

      default:
        return true;
    }
  }

  function validateForm(options = {}) {
    const { focusFirstInvalid = false, showSummary = false } = options;
    const values = getValues();
    const fieldOrder = ["fullName", "email", "phone", "country", "city", "howFound", "dateOfBirth", "terms"];

    let firstInvalidField = null;
    let hasErrors = false;

    fieldOrder.forEach((fieldKey) => {
      const isValid = validateField(fieldKey, values);
      if (!isValid) {
        hasErrors = true;
        firstInvalidField = firstInvalidField || fieldMap[fieldKey];
      }
    });

    if (hasErrors) {
      if (showSummary) {
        summaryError.textContent = "Please correct the highlighted fields and try again.";
        summaryError.classList.remove("hidden");
      }
      if (focusFirstInvalid && firstInvalidField) {
        firstInvalidField.focus();
      }
      return false;
    }

    summaryError.textContent = "";
    summaryError.classList.add("hidden");
    return true;
  }

  function handleRealtimeValidation(fieldKey) {
    hideSuccessMessage();
    const values = getValues();
    validateField(fieldKey, values);

    if (validateForm({ focusFirstInvalid: false, showSummary: false })) {
      summaryError.textContent = "";
      summaryError.classList.add("hidden");
    }
  }

  countrySelect.addEventListener("change", () => {
    populateCities();
    handleRealtimeValidation("country");
    handleRealtimeValidation("phone");
    handleRealtimeValidation("city");
  });

  citySelect.addEventListener("change", () => {
    populateFavoriteLocations();
    handleRealtimeValidation("city");
  });

  fullNameInput.addEventListener("input", () => {
    handleRealtimeValidation("fullName");
  });

  emailInput.addEventListener("input", () => {
    handleRealtimeValidation("email");
  });

  phoneInput.addEventListener("input", () => {
    handleRealtimeValidation("phone");
  });

  howFoundSelect.addEventListener("change", () => {
    handleRealtimeValidation("howFound");
  });

  dateOfBirthInput.addEventListener("change", () => {
    handleRealtimeValidation("dateOfBirth");
  });

  termsCheckbox.addEventListener("change", () => {
    handleRealtimeValidation("terms");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideSuccessMessage();

    if (!validateForm({ focusFirstInvalid: true, showSummary: true })) {
      return;
    }

    successMessage.innerHTML =
      "<strong>Welcome to Brasa Points!</strong><br><br>Your registration was successful. You will receive a confirmation email in the next few minutes with your account details and how to start earning points.<br><br>You can now enjoy your benefits at any of our 14 locations!";
    successMessage.classList.remove("hidden");

    form.reset();
    summaryError.textContent = "";
    summaryError.classList.add("hidden");
    citySelect.disabled = true;
    favoriteLocationSelect.disabled = true;
    citySelect.innerHTML = "";
    citySelect.appendChild(createOption("", "Select city"));
    favoriteLocationSelect.innerHTML = "";
    favoriteLocationSelect.appendChild(createOption("", "Select favorite location (optional)"));
  });
}
