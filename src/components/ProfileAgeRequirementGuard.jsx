import { useEffect } from "react";

const MINIMUM_AGE = 13;

function calculateAge(value) {
  if (!value) return null;

  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function latestAllowedDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - MINIMUM_AGE);
  return date.toISOString().slice(0, 10);
}

export default function ProfileAgeRequirementGuard() {
  useEffect(() => {
    let form = null;
    let dateInput = null;

    function validateDate() {
      if (!dateInput) return true;

      dateInput.setCustomValidity("");
      if (!dateInput.value) return true;

      const age = calculateAge(dateInput.value);
      if (age === null) {
        dateInput.setCustomValidity("Enter a valid date of birth.");
        return false;
      }

      if (age < MINIMUM_AGE) {
        dateInput.setCustomValidity(
          "You must be at least 13 years old to use BURGRS."
        );
        return false;
      }

      return true;
    }

    function handleSubmit(event) {
      if (validateDate()) return;

      event.preventDefault();
      event.stopPropagation();
      dateInput?.reportValidity();
      dateInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function attach() {
      const profilePage = document.querySelector(".profile-edit-page");
      const nextForm = profilePage?.querySelector("form") || null;
      const nextDateInput = nextForm?.querySelector('input[type="date"]') || null;

      if (form === nextForm && dateInput === nextDateInput) return;

      form?.removeEventListener("submit", handleSubmit, true);
      dateInput?.removeEventListener("input", validateDate);
      dateInput?.removeEventListener("change", validateDate);

      form = nextForm;
      dateInput = nextDateInput;

      if (!form || !dateInput) return;

      dateInput.max = latestAllowedDate();
      dateInput.addEventListener("input", validateDate);
      dateInput.addEventListener("change", validateDate);
      form.addEventListener("submit", handleSubmit, true);
    }

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      form?.removeEventListener("submit", handleSubmit, true);
      dateInput?.removeEventListener("input", validateDate);
      dateInput?.removeEventListener("change", validateDate);
    };
  }, []);

  return null;
}
